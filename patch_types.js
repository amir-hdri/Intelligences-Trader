const fs = require('fs');
const path = require('path');

const riskFilePath = path.join('robot trader', 'src', 'riskEngine.test.ts');
let riskCode = fs.readFileSync(riskFilePath, 'utf8');

const riskSearch = `      timeframeAnalysis: undefined,`;
const riskReplacement = `      timeframeAnalysis: {} as any,`;

if (riskCode.includes(riskSearch)) {
    riskCode = riskCode.replace(riskSearch, riskReplacement);
    fs.writeFileSync(riskFilePath, riskCode);
    console.log('Patch riskEngine applied successfully.');
} else {
    console.error('Failed to find search string in riskEngine.test.ts');
}
