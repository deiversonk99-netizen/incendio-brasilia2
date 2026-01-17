import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const pdf = require('pdf-parse');

const dataBuffer = fs.readFileSync('public/RESIDENCIAL VIA NATURALE20260108_173943_965.pdf');

pdf(dataBuffer).then(function (data) {
    console.log(data.text);
}).catch(err => {
    console.error(err);
});
