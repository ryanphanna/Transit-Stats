const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'styles/main.css');
const src = fs.readFileSync(srcFile, 'utf8');
const lines = src.split('\n');

function writeBlock(filename, startLines, endLine) {
    const startObj = Array.isArray(startLines) ? startLines : [startLines];
    let content = '';
    
    for (let i = 0; i < startObj.length; i++) {
        const start = startObj[i][0];
        const end = startObj[i][1] || endLine;
        content += lines.slice(start - 1, end).join('\n') + '\n\n';
    }
    
    const target = path.join(__dirname, 'styles', filename);
    fs.writeFileSync(target, content);
    console.log(`Wrote ${target} (${content.split('\n').length} lines)`);
}

// Map the line ranges we found earlier into their respective files
// 1 to 54 = Variables
writeBlock('core/variables.css', [[1, 54]]);

// 55 to 148 = Base styles
writeBlock('core/base.css', [[55, 148]]);

// 149 to 308 (Headers, Views, Auth, Banner) 
// BUT wait, 1651 to end is ALSO Header. So let's combine header things.
writeBlock('components/header.css', [[149, 222], [1651, 1770]]);

// Remaining core views/auth
writeBlock('pages/auth.css', [[239, 283]]);

// Cards: 350 to 379
writeBlock('components/cards.css', [[350, 379]]);

// Modals: 838 to 930
writeBlock('components/modals.css', [[838, 930]]);

// Forms & Tables: 529 to 625
writeBlock('components/forms.css', [[529, 625]]);

// Settings: 626 to 837 + 1449 to 1575
writeBlock('pages/settings.css', [[626, 837], [1449, 1575]]);

// Dashboard (Grid, Trip Cards, Stats, Advanced Analytics, Activity Grid)
writeBlock('pages/dashboard.css', [
    [223, 238], // views
    [284, 349], // layout
    [380, 528], // trips/stats
    [931, 1018], // peak times, connector
    [1391, 1448] // activity grid
]);

// Admin: 1019 to 1390
writeBlock('pages/admin.css', [[1019, 1390]]);

// Map: 1576 to 1650
writeBlock('pages/map.css', [[1576, 1650]]);

// Now rewrite main.css as a manifest
const manifest = `/* --- TransitStats Core --- */
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
`;

fs.writeFileSync(srcFile, manifest);
console.log('Wrote main.css manifest.');
