import re

with open('c:\\Users\\ivymu\\OrthoViewPlus\\server\\src\\routes\\exposure.js', 'r') as f:
    content = f.read()

# Remove the stray ) that appears after } on the same block
# The pattern is: } followed by ) on the next line, then blank line, then if admin check
old_pattern = '}\n)\n\n    if (req.user?.role !== \'administrator\') {'
new_pattern = '}\n\n    if (req.user?.role !== \'administrator\') {'

if old_pattern in content:
    content = content.replace(old_pattern, new_pattern)
    with open('c:\\Users\\ivymu\\OrthoViewPlus\\server\\src\\routes\\exposure.js', 'w') as f:
        f.write(content)
    print('File fixed successfully')
else:
    print('Pattern not found. Looking for alternative...')
    # Try alternative patterns
    if '}\n)' in content:
        print('Found }\\n) pattern')
    else:
        print('Alternative pattern not found either')