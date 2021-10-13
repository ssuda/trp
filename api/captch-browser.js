const { ipcMain }  = require('electron');
const { v4: uuidv4 } = require('uuid');

module.exports = async function(image, renderer) {
    return new Promise((resolve, reject) => {
        const id = uuidv4();
        ipcMain.once('captcha-response',  (event, args) => {
            if (args.id === id) {
                console.log('Received captcha response from browser', args);
                resolve(args.data);
            }
        });
        image = 'data:image/png;base64,' + image.toString('base64');
        console.log('Received captcha to browser', image);
        renderer.send('captcha', {image, id});
    });
}