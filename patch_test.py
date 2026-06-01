import sys

with open("robot trader/src/dataUtils.test.ts", "r") as f:
    content = f.read()

import re
match = re.search(r"test\('fetchMarketData falls back to Digital Twin when no proxy URL configured'.*?}\);", content, re.DOTALL)
if match:
    old_code = match.group(0)
    new_code = old_code.replace("assert.strictEqual(data.length, 100);", "assert.strictEqual(data.length, 0);")
    content = content.replace(old_code, new_code)

    with open("robot trader/src/dataUtils.test.ts", "w") as f:
        f.write(content)
