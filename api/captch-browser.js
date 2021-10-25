const { ipcMain }  = require('electron');
const { v4: uuidv4 } = require('uuid');

let promises = {};

ipcMain.on('captcha-response',  (event, args) => {
    console.log('Received captcha response from browser', args);
    promises[args.id](args.data);
    delete promises[args.id];
});

module.exports = async function(image, renderer) {
    return new Promise((resolve, reject) => {
        const id = uuidv4();
        promises[id] = resolve;
        image = 'data:image/png;base64,' + image.toString('base64');
        console.log('Sending captcha to browser', image);
        renderer.send('captcha', {image, id});
    });
}