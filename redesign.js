import fs from 'fs';
import path from 'path';

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else if (file.endsWith('.svelte') || file.endsWith('.css') || file.endsWith('.html')) {
            results.push(file);
        }
    });
    return results;
}

const files = walk('./src');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Remove dark: classes
    content = content.replace(/dark:[\w\-\/\[\]\.]+/g, '');
    
    // Clean up multiple spaces left by removal
    content = content.replace(/\s{2,}/g, (match) => {
        // Only replace spaces if they are inside a class string (we can be lazy and just assume inside class string is fine, but it might mess up svelte formatting)
        // Let's just do it for strings containing `class="`
        return match;
    });

    // We can clean up spaces inside class="..."
    content = content.replace(/class="([^"]+)"/g, (match, p1) => {
        return `class="${p1.replace(/\s+/g, ' ').trim()}"`;
    });
    content = content.replace(/class=\{`([^`]+)`\}/g, (match, p1) => {
        return `class={\`${p1.replace(/\s+/g, ' ').trim()}\`}`;
    });
    content = content.replace(/class=\{'([^']+)'\}/g, (match, p1) => {
        return `class={'${p1.replace(/\s+/g, ' ').trim()}'}`;
    });
    
    // Replace blue colors with slate
    const colorMap = {
        'blue-50': 'slate-100',
        'blue-100': 'slate-200',
        'blue-200': 'slate-300',
        'blue-300': 'slate-400',
        'blue-400': 'slate-800',
        'blue-500': 'slate-900',
        'blue-600': 'slate-900',
        'blue-650': 'slate-900',
        'blue-700': 'slate-950',
        'blue-800': 'slate-950',
        'blue-900': 'slate-950',
        'blue-950': 'slate-950',
        'indigo-500': 'slate-900',
        'indigo-950': 'slate-950'
    };

    for (const [blue, slate] of Object.entries(colorMap)) {
        // regex to match blue-xxx but not blue-xxx-something (using word boundary, but handling slashes)
        const regex = new RegExp(`(?<![a-zA-Z\\-])` + blue + `(?![0-9])`, 'g');
        content = content.replace(regex, slate);
    }

    fs.writeFileSync(file, content, 'utf8');
    console.log(`Processed ${file}`);
});
