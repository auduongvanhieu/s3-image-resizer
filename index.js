'use strict'


const AWS = require('aws-sdk');
const S3 = new AWS.S3({ signatureVersion: 'v4' });
const Sharp = require('sharp');
const PathPattern = /(.*\/)?(.*)\/(.*)/;

// parameters
const BUCKET = "lifeon-v2"
const URL = "http://lifeon-v2.s3-website-ap-southeast-1.amazonaws.com"
const WHITELIST_STR = "1000x1000 1000xAUTO 768xAUTO 576xAUTO 320xAUTO 64xAUTO"
const WHITELIST = Object.freeze(WHITELIST_STR.split(' '))

exports.handler = async (event) => {
    const path = event.queryStringParameters.path;
    const parts = PathPattern.exec(path);
    let dir = parts[1] || '';
    let resizeOption = parts[2];  // e.g. "150x150_max"
    let filename = parts[3];
    console.log("hieunv", "parts", parts)
    console.log("hieunv", "parts_length", parts.length)
    if (parts.length == 5) {
        dir = parts[1] + '/' + parts[2] || '';
        resizeOption = parts[3];  // e.g. "150x150_max"
        filename = parts[4];
    }
    let sizeAndAction = resizeOption.split('_');

    const sizes = sizeAndAction[0].split("x");
    const action = sizeAndAction.length > 1 ? sizeAndAction[1] : null;

    // Whitelist validation.
    if (false && WHITELIST && !WHITELIST.includes(resizeOption)) {
        return {
            statusCode: 400,
            body: `WHITELIST is set but does not contain the size parameter "${resizeOption}"`,
            headers: { "Content-Type": "text/plain" }
        };
    }

    // Action validation.
    if (action && action !== 'max' && action !== 'min') {
        return {
            statusCode: 400,
            body: `Unknown func parameter "${action}"\n` +
                'For query ".../150x150_func", "_func" must be either empty, "_min" or "_max"',
            headers: { "Content-Type": "text/plain" }
        };
    }

    try {
        const data = await S3
            .getObject({ Bucket: BUCKET, Key: dir + filename })
            .promise();

        const width = sizes[0] === 'AUTO' ? null : parseInt(sizes[0]);
        const height = sizes[1] === 'AUTO' ? null : parseInt(sizes[1]);
        let fit;
        switch (action) {
            case 'max':
                fit = 'inside';
                break;
            case 'min':
                fit = 'outside';
                break;
            default:
                fit = 'cover';
                break;
        }
        const result = await Sharp(data.Body, { failOnError: false })
            .resize(width, height, { withoutEnlargement: true, fit })
            .rotate()
            .toBuffer();
        console.log("hieunv", "sharp_result", result)

        const putObjectResult = await S3.putObject({
            Body: result,
            Bucket: BUCKET,
            ContentType: data.ContentType,
            Key: path,
            CacheControl: 'public, max-age=86400'
        }).promise();
        console.log("hieunv", "path", path)
        console.log("hieunv", "putObjectResult", putObjectResult)

        return {
            statusCode: 301,
            headers: { "Location": `${URL}/${path}` }
        };
    } catch (e) {
        return {
            statusCode: e.statusCode || 400,
            body: 'Exception: ' + e.message,
            headers: { "Content-Type": "text/plain" }
        };
    }
}
