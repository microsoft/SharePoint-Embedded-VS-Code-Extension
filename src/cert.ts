import * as forge from 'node-forge';
import * as fs from 'fs';
import * as vscode from 'vscode';
const { v4: uuidv4 } = require('uuid');
import * as rsa from 'jsrsasign'
import path = require('path');
import axios from 'axios';
import { accessToken, clientId, consumingTenantId } from './utils/constants';

export function generateCertificateAndPrivateKey(): void {
    // Create a new certificate
    const keys = forge.pki.rsa.generateKeyPair(2048);
    const cert = forge.pki.createCertificate();

    // Set certificate attributes
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    const attrs = [
        { name: 'commonName', value: 'alexVSC' }
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // Sign the certificate
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Export the certificate and private key in PEM format
    const certPem = forge.pki.certificateToPem(cert);
    const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

    // Convert the PEM-encoded private key to Base64
    const privateKeyBytes = Buffer.from(privateKeyPem, 'utf8');
    const privateKeyBase64 = privateKeyBytes.toString('base64');

    try {
        // Construct the parent directory path
        const parentDirectoryPath = path.join(__dirname, '..');

        const directoryPath = path.join(parentDirectoryPath, 'certs');
        if (!fs.existsSync(directoryPath)) {
            fs.mkdirSync(directoryPath, { recursive: true });
        }

        fs.writeFileSync(path.join(directoryPath, 'certificate.pem'), certPem);
        fs.writeFileSync(path.join(directoryPath, 'privateKey.pem'), privateKeyPem);
        fs.writeFileSync(path.join(directoryPath, 'privateKeyBase64.txt'), privateKeyBase64);
    } catch (error) {
        console.error('Error writing files:', error);
    }
}

export async function uploadCert() {
    // Construct the parent directory path
    const parentDirectoryPath = path.join(__dirname, '..');

    const directoryPath = path.join(parentDirectoryPath, 'certs/certificate.pem');
    const certBase64 = fs.readFileSync(directoryPath, 'base64');

    const currentDate = new Date();
    const startDate = currentDate.toISOString();

    const keyCredential = {
        endDateTime: '2024-08-01T00:00:00Z',
        startDateTime: startDate,
        type: 'AsymmetricX509Cert',
        usage: 'verify',
        key: certBase64,
        displayName: 'CN=AlexVSC'
    };


    const headers = {
        Authorization: `Bearer ${accessToken}`,
    };

    try {
        const response = await axios({
            method: 'patch',
            url: `https://graph.microsoft.com/v1.0/applications(appId='${clientId}')`,
            data: {
                keyCredentials: [keyCredential]
            },
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        console.log('Key credential updated successfully:', response.data);
    } catch (error: any) {
        console.error('Error updating key credential:', error.response.data);
    }

    let thumbprint;

    try {
        const response = await axios.get(`https://graph.microsoft.com/v1.0/applications?$filter=appId eq '${clientId}'`, { headers });

        if (response.data.value && response.data.value.length > 0) {
            const application = response.data.value[0];
            const keyCredentials = application.keyCredentials;

            if (keyCredentials && keyCredentials.length > 0) {
                thumbprint = keyCredentials[0].customKeyIdentifier;
                console.log('Thumbprint:', thumbprint);
                let token = await acquireAppOnlyCertSPOToken(thumbprint);
                console.log('AppOnlyToken: ', token);
            } else {
                console.log('No key credentials found for the application.');
            }
        } else {
            console.log('Application not found.');
        }
    } catch (error: any) {
        console.error('Error:', error.response?.data || error.message);
    }
}

async function acquireAppOnlyCertSPOToken(certThumbprint: string) {
    console.log("Acquiring a new access token");
    let jwt = getRequestJwt(certThumbprint);
    console.log(jwt);

    // Construct the token request data
    const tokenRequestBody = new URLSearchParams({
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: jwt,
        client_id: clientId,
        scope: 'https://a830edad9050849alexpnp.sharepoint.com/.default',
        //scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials'
    });

    const tokenRequestOptions = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    };

    try {
        const response = await axios.post(
            `https://login.microsoftonline.com/${consumingTenantId}/oauth2/v2.0/token`,
            tokenRequestBody.toString(),
            tokenRequestOptions
        );

        const accessToken = response.data.access_token;
        return accessToken;
        // Use the obtained access token for API calls
    } catch (error) {
        console.error('Error obtaining access token:', error);
    }
}

function getRequestJwt(thumbprint: string) {
    // Construct the parent directory path
    const parentDirectoryPath = path.join(__dirname, '..');

    const directoryPath = path.join(parentDirectoryPath, 'certs/privateKey.pem');
    const pk = fs.readFileSync(directoryPath, 'utf8');

    const header = {
        'alg': 'RS256',
        'typ': 'JWT',
        'x5t': safeBase64EncodedThumbprint(thumbprint)
    };

    const now = getTimeInSec();
    const payload = {
        'aud': `https://login.microsoftonline.com/${consumingTenantId}/oauth2/v2.0/token`,
        'exp': now + 60 * 60,
        'iss': clientId, //client id 
        'jti': uuidv4(),
        'nbf': now,
        'sub': clientId, //client id 
        'iat': now
    };

    var encryptedPk = pk
    var decryptedPk = encryptedPk;
    // if (pm.environment.has('CertPassword') && pm.environment.get('CertPassword') !== '') {
    //     decryptedPk = rsa.KEYUTIL.getKey(encryptedPk, pm.environment.get('CertPassword'));
    // }
    var sHeader = JSON.stringify(header);
    var sPayload = JSON.stringify(payload);
    return rsa.KJUR.jws.JWS.sign(header.alg, sHeader, sPayload, decryptedPk);
}

function getTimeInSec() {
    return Math.floor(Date.now() / 1000);
}

function safeBase64EncodedThumbprint(thumbprint: string) {
    var numCharIn128BitHexString = 128 / 8 * 2;
    var numCharIn160BitHexString = 160 / 8 * 2;
    var thumbprintSizes: any = {};
    thumbprintSizes[numCharIn128BitHexString] = true;
    thumbprintSizes[numCharIn160BitHexString] = true;
    var thumbprintRegExp = /^[a-f\d]*$/;

    var hexString = thumbprint.toLowerCase().replace(/:/g, '').replace(/ /g, '');

    if (!thumbprintSizes[hexString.length] || !thumbprintRegExp.test(hexString)) {
        throw 'The thumbprint does not match a known format';
    }

    var base64 = (Buffer.from(hexString, 'hex')).toString('base64');
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

