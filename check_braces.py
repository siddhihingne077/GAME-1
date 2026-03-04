import sys
try:
    with open('app.js', 'r', encoding='utf-8') as f:
        content = f.read()
    depth = 0
    lines = content.split('\n')
    for i, line in enumerate(lines):
        for char in line:
            if char == '{':
                depth += 1
            elif char == '}':
                depth -= 1
            if depth < 0:
                print(f'Negative depth at line {i+1}: {line.strip()}')
                sys.exit(1)
    print(f'Final depth: {depth}')
except Exception as e:
    print(f'Error: {e}')
    sys.exit(1)
