/**
 * Encrypts plain text using AES-256-CBC.
 * Returns IV and cipher text joined by a colon.
 */
export declare function encrypt(text: string): string;
/**
 * Decrypts a formatted ciphertext (iv:ciphertext) back to plain text.
 */
export declare function decrypt(encryptedText: string): string;
//# sourceMappingURL=crypto.d.ts.map