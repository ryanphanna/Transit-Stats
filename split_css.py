import os

base_dir = "."
src_file = os.path.join(base_dir, "styles/main.css")

with open(src_file, "r") as f:
    lines = f.readlines()

def write_block(filename, blocks):
    content = ""
    for start, end in blocks:
        # 1-indexed to 0-indexed
        content += "".join(lines[start-1:end]) + "\n\n"
        
    target = os.path.join(base_dir, "styles", filename)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "w") as f:
        f.write(content)
    print(f"Wrote {target} ({len(content.splitlines())} lines)")

write_block('core/variables.css', [(1, 54)])
write_block('core/base.css', [(55, 148)])
write_block('components/header.css', [(149, 222), (1651, 1770)])
write_block('pages/auth.css', [(239, 283)])
write_block('components/cards.css', [(350, 379)])
write_block('components/modals.css', [(838, 930)])
write_block('components/forms.css', [(529, 625)])
write_block('pages/settings.css', [(626, 837), (1449, 1575)])
write_block('pages/dashboard.css', [
    (223, 238), 
    (284, 349), 
    (380, 528), 
    (931, 1018), 
    (1391, 1448)
])
write_block('pages/admin.css', [(1019, 1390)])
write_block('pages/map.css', [(1576, 1650)])

manifest = """/* --- TransitStats Core --- */
@import url('./core/variables.css');
@import url('./core/base.css');

/* --- Components --- */
@import url('./components/header.css');
@import url('./components/cards.css');
@import url('./components/modals.css');
@import url('./components/forms.css');

/* --- Pages --- */
@import url('./pages/auth.css');
@import url('./pages/dashboard.css');
@import url('./pages/admin.css');
@import url('./pages/map.css');
@import url('./pages/settings.css');
"""

with open(src_file, "w") as f:
    f.write(manifest)
print("Wrote main.css manifest.")
