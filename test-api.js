const axios = require('axios');
axios.get('https://api.sms-virtuals.net/api').then(r => {
    const match = r.data.match(/data-configuration="(.*?)"/);
    if(match) {
        let jsonStr = match[1].replace(/&quot;/g, '"');
        const cfg = JSON.parse(jsonStr);
        console.log("HISTORY:");
        console.log(JSON.stringify(cfg.content.paths['/v1/public/deposits/history'], null, 2));
    }
}).catch(e => console.log(e.message));
