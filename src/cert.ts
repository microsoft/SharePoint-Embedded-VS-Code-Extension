import * as forge from 'node-forge';
import { v4 as uuidv4 } from 'uuid';
import * as rsa from 'jsrsasign'
import axios from 'axios';
import { consumingTenantId } from './utils/constants';

export function generateCertificateAndPrivateKey(): { certificatePEM: string, privateKey: string, thumbprint: string } {
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
        { name: 'commonName', value: 'Syntex repository services VS Code Ext' }
    ];

    cert.setSubject(attrs);
    cert.setIssuer(attrs);

    // Sign the certificate
    cert.sign(keys.privateKey, forge.md.sha256.create());

    // Export the certificate and private key in PEM format
    const certPem = forge.pki.certificateToPem(cert);
    const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);

    const md = forge.md.sha1.create();
    md.update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes());
    const thumbprint = md.digest().toHex();
    console.log(thumbprint);

    return { 'certificatePEM': certPem, 'privateKey': privateKeyPem, 'thumbprint': thumbprint }
}

export function createKeyCredential(certString: string) {
    const buffer = Buffer.from(certString, "utf-8");
    const certBase64 = buffer.toString("base64");
    const currentDate = new Date();
    const newEndDateTime = new Date(currentDate);
    newEndDateTime.setFullYear(currentDate.getFullYear() + 1); // Add 1 year
    newEndDateTime.setHours(currentDate.getHours() - 1);      // Subtract 1 hour

    const startTime = currentDate.toISOString();
    const endDateTime = newEndDateTime.toISOString();

    const keyCredential = {
        startDateTime: startTime,
        endDateTime: endDateTime,
        type: 'AsymmetricX509Cert',
        usage: 'verify',
        key: certBase64,
        displayName: 'CN=Syntex repository services VS Code Ext'
    };

    return keyCredential;
}

export async function acquireAppOnlyCertSPOToken(certThumbprint: string, clientId: string, domain: string, privateKey: string) {
    console.log("Acquiring a new access token");
    let jwt = getRequestJwt(certThumbprint, clientId, privateKey);
    console.log(jwt);

    const tokenRequestBody = new URLSearchParams({
        client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: jwt,
        client_id: clientId,
        scope: `https://${domain}.sharepoint.com/.default`,
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
    } catch (error) {
        console.error('Error obtaining access token:', error);
    }
}

function getRequestJwt(thumbprint: string, clientId: string, privateKey: string) {
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

    var encryptedPk = privateKey
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

