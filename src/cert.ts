/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as forge from 'node-forge';
import { KeyCredential } from "@microsoft/microsoft-graph-types";

export function generateCertificateAndPrivateKey(): { certificatePEM: string, privateKey: string, thumbprint: string} {
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
        { name: 'commonName', value: 'SharePoint Embedded VSCode Extension' }
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

    return { 
        certificatePEM: certPem, 
        privateKey: privateKeyPem, 
        thumbprint: thumbprint
    };
}

export function createCertKeyCredential(certString: string): KeyCredential {
    const buffer = Buffer.from(certString, "utf-8");
    const certBase64 = buffer.toString("base64");
    const currentDate = new Date();
    const newEndDateTime = new Date(currentDate);
    newEndDateTime.setDate(currentDate.getDate() + 60); // 60 day TTL

    const startTime = currentDate.toISOString();
    const endDateTime = newEndDateTime.toISOString();

    const keyCredential = {
        startDateTime: startTime,
        endDateTime: endDateTime,
        type: 'AsymmetricX509Cert',
        usage: 'verify',
        key: certBase64,
        displayName: 'CN=SharePoint Embedded VS Code Ext'
    };

    return keyCredential;
}
