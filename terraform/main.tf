terraform {
  required_version = ">= 1.5.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.52, < 7.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = ">= 2.17, < 3.0"
    }
  }
}

variable "aws_region" {
  type        = string
  description = "AWS region in which to create the research cluster"
  default     = "eu-central-1"
}

variable "kubernetes_version" {
  type        = string
  description = "EKS version validated by the platform team before apply"
  default     = "1.33"
}

variable "environment" {
  type        = string
  default     = "research"
  validation {
    condition     = contains(["research", "staging", "production"], var.environment)
    error_message = "environment must be research, staging, or production"
  }
}

provider "aws" {
  region = var.aws_region
}

locals {
  name = "intelligences-${var.environment}"
  tags = {
    Project     = "Intelligences-Trader"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 6.6"

  name = "${local.name}-vpc"
  cidr = "10.0.0.0/16"

  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = var.environment != "production"
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags = local.tags
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 21.24"

  name               = "${local.name}-cluster"
  kubernetes_version = var.kubernetes_version
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnets

  endpoint_public_access                   = true
  enable_cluster_creator_admin_permissions = true

  eks_managed_node_groups = {
    general = {
      min_size       = 2
      max_size       = 5
      desired_size   = 3
      instance_types = ["t3.large"]
    }
    inference = {
      min_size       = 1
      max_size       = 10
      desired_size   = 2
      instance_types = ["c6i.xlarge"]
      labels         = { workload = "inference" }
    }
  }

  tags = local.tags
}

provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
      command     = "aws"
    }
  }
}

resource "helm_release" "argocd" {
  name             = "argocd"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  namespace        = "argocd"
  create_namespace = true
  atomic           = true
  timeout          = 600
}

# Vault still requires an explicit production storage/unseal design before use.
# The research configuration is intentionally non-HA and must not hold live secrets.
resource "helm_release" "vault" {
  count = var.environment == "research" ? 1 : 0

  name             = "vault"
  repository       = "https://helm.releases.hashicorp.com"
  chart            = "vault"
  namespace        = "vault"
  create_namespace = true
  atomic           = true
  timeout          = 600

  set {
    name  = "server.dev.enabled"
    value = var.environment == "research" ? "true" : "false"
  }
}
