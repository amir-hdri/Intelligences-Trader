import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Categorical, Beta
import numpy as np

class Chomp1d(nn.Module):
    """
    Remove padding to make the convolution causal.
    """
    def __init__(self, chomp_size):
        super(Chomp1d, self).__init__()
        self.chomp_size = chomp_size

    def forward(self, x):
        return x[:, :, :-self.chomp_size].contiguous()

class TemporalBlock(nn.Module):
    def __init__(self, n_inputs, n_outputs, kernel_size, stride, dilation, padding, dropout=0.2):
        super(TemporalBlock, self).__init__()
        self.conv1 = nn.utils.weight_norm(nn.Conv1d(n_inputs, n_outputs, kernel_size,
                                           stride=stride, padding=padding, dilation=dilation))
        self.chomp1 = Chomp1d(padding)
        self.relu1 = nn.ReLU()
        self.dropout1 = nn.Dropout(dropout)

        self.conv2 = nn.utils.weight_norm(nn.Conv1d(n_outputs, n_outputs, kernel_size,
                                           stride=stride, padding=padding, dilation=dilation))
        self.chomp2 = Chomp1d(padding)
        self.relu2 = nn.ReLU()
        self.dropout2 = nn.Dropout(dropout)

        self.net = nn.Sequential(self.conv1, self.chomp1, self.relu1, self.dropout1,
                                 self.conv2, self.chomp2, self.relu2, self.dropout2)
        
        self.downsample = nn.Conv1d(n_inputs, n_outputs, 1) if n_inputs != n_outputs else None
        self.relu = nn.ReLU()
        self.init_weights()

    def init_weights(self):
        self.conv1.weight.data.normal_(0, 0.01)
        self.conv2.weight.data.normal_(0, 0.01)
        if self.downsample is not None:
            self.downsample.weight.data.normal_(0, 0.01)

    def forward(self, x):
        out = self.net(x)
        res = x if self.downsample is None else self.downsample(x)
        return self.relu(out + res)

class TemporalConvolutionalNetwork(nn.Module):
    def __init__(self, num_inputs, num_channels, kernel_size=2, dropout=0.2):
        super(TemporalConvolutionalNetwork, self).__init__()
        layers = []
        num_levels = len(num_channels)
        for i in range(num_levels):
            dilation_size = 2 ** i
            in_channels = num_inputs if i == 0 else num_channels[i-1]
            out_channels = num_channels[i]
            layers += [TemporalBlock(in_channels, out_channels, kernel_size, stride=1, dilation=dilation_size,
                                     padding=(kernel_size-1)*dilation_size, dropout=dropout)]

        self.network = nn.Sequential(*layers)

    def forward(self, x):
        # Input shape: [Batch, Features, SeqLen]
        return self.network(x)

class ActorCritic(nn.Module):
    """
    PPO Actor-Critic Network with TCN base and Autoregressive Beta Distribution for Position Sizing.
    """
    def __init__(self, state_dim, action_dim=2, seq_len=30, tcn_channels=[32, 32, 32]):
        super(ActorCritic, self).__init__()
        # State dim is the number of features (e.g. 5)
        self.tcn = TemporalConvolutionalNetwork(state_dim, tcn_channels, kernel_size=3)
        self.seq_len = seq_len
        self.feature_dim = tcn_channels[-1]
        
        # Dense feature aggregator
        self.fc = nn.Linear(self.feature_dim * seq_len, 64)
        
        # Actor Heads
        # 1. Direction Head: 3 discrete outputs (0: Short, 1: Hold, 2: Long)
        self.dir_head = nn.Linear(64, 3)
        
        # 2. Size Head: Alpha and Beta params for Beta distribution (both > 1.0 for unimodal distribution)
        self.size_alpha = nn.Linear(64, 1)
        self.size_beta = nn.Linear(64, 1)
        
        # Critic Head
        self.critic_head = nn.Linear(64, 1)

    def forward(self, x):
        # x shape: [Batch, SeqLen, Features]
        # Reshape to [Batch, Features, SeqLen] for Conv1d
        x = x.transpose(1, 2)
        h = self.tcn(x)
        h = h.view(h.size(0), -1)  # Flatten
        h = F.relu(self.fc(h))
        
        # Value prediction
        value = self.critic_head(h)
        
        # Direction logits
        dir_logits = self.dir_head(h)
        dir_probs = F.softmax(dir_logits, dim=-1)
        
        # Position size parameters
        # Add 1.0 to Softplus output to ensure alpha and beta are >= 1.0
        alpha = F.softplus(self.size_alpha(h)) + 1.0
        beta = F.softplus(self.size_beta(h)) + 1.0
        
        return value, dir_probs, alpha, beta

    def act(self, state_seq):
        """
        Act stochastically (during training).
        state_seq: [SeqLen, Features]
        """
        # Add batch dimension
        state_tensor = torch.FloatTensor(state_seq).unsqueeze(0)
        
        with torch.no_grad():
            value, dir_probs, alpha, beta = self.forward(state_tensor)
            
            # Sample direction
            dir_dist = Categorical(dir_probs)
            dir_action = dir_dist.sample()
            
            # Sample size using Beta distribution
            size_dist = Beta(alpha, beta)
            size_action = size_dist.sample()
            
            # Compute log probabilities
            dir_log_prob = dir_dist.log_prob(dir_action)
            size_log_prob = size_dist.log_prob(size_action)
            
            # Total log probability (sum of independent action components)
            total_log_prob = dir_log_prob + size_log_prob
            
            # Actions: [direction (0, 1, 2), size [0, 1]]
            action = np.array([dir_action.item(), size_action.item()], dtype=np.float32)
            
        return action, total_log_prob.item(), value.item()

    def evaluate(self, states, dir_actions, size_actions):
        """
        Evaluate states for PPO update.
        """
        value, dir_probs, alpha, beta = self.forward(states)
        
        dir_dist = Categorical(dir_probs)
        dir_log_probs = dir_dist.log_prob(dir_actions)
        dir_entropy = dir_dist.entropy()
        
        size_dist = Beta(alpha, beta)
        size_log_probs = size_dist.log_prob(size_actions).squeeze(-1)
        size_entropy = size_dist.entropy().squeeze(-1)
        
        # Combined log probs and entropy
        log_probs = dir_log_probs + size_log_probs
        entropy = dir_entropy + size_entropy
        
        return value, log_probs, entropy
        
    def export_to_onnx(self, file_path):
        """
        Export the actor-critic model to ONNX format.
        For inference, we return:
        - dir_probs (shape: [Batch, 3])
        - expected_size (mean of Beta distribution: alpha / (alpha + beta))
        """
        class ONNXWrapper(nn.Module):
            def __init__(self, model):
                super().__init__()
                self.model = model
                
            def forward(self, x):
                _, dir_probs, alpha, beta = self.model(x)
                expected_size = alpha / (alpha + beta)
                return dir_probs, expected_size
                
        onnx_model = ONNXWrapper(self)
        in_channels = self.tcn.network[0].conv1.in_channels
        dummy_input = torch.randn(1, self.seq_len, in_channels)
        
        torch.onnx.export(
            onnx_model,
            dummy_input,
            file_path,
            input_names=['input'],
            output_names=['dir_probabilities', 'expected_position_size'],
            dynamic_axes={'input': {0: 'batch_size'}},
            opset_version=14
        )
