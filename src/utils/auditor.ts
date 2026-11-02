import { Encoding } from './encoding';

// Added SYSTEM and PQ_X3DH to the allowed stages
type AuditStage = 'INIT' | 'SYSTEM' | 'KEY_GEN' | 'X3DH' | 'PQ_X3DH' | 'RATCHET' | 'ENCRYPT' | 'DECRYPT';

export const CryptoAuditor = {
    log: (stage: AuditStage, action: string, algorithm: string, description: string, details?: any) => {
        const styles: Record<AuditStage, string> = {
            'INIT': 'color: #00E676; font-weight: bold; background: #1B5E20; padding: 3px 8px; border-radius: 4px; font-size: 12px;',
            'SYSTEM': 'color: #FFFFFF; font-weight: bold; background: #424242; padding: 3px 8px; border-radius: 4px; font-size: 12px;', // Clean slate for system events
            'KEY_GEN': 'color: #18FFFF; font-weight: bold; background: #006064; padding: 3px 8px; border-radius: 4px; font-size: 12px;',
            'X3DH': 'color: #D500F9; font-weight: bold; background: #4A148C; padding: 3px 8px; border-radius: 4px; font-size: 12px;',
            'PQ_X3DH': 'color: #FF4081; font-weight: bold; background: #880E4F; padding: 3px 8px; border-radius: 4px; font-size: 12px;', // High-visibility pink/magenta for Quantum ops
            'RATCHET': 'color: #FFEA00; font-weight: bold; background: #F57F17; padding: 3px 8px; border-radius: 4px; font-size: 12px;',
            'ENCRYPT': 'color: #FF3D00; font-weight: bold; background: #BF360C; padding: 3px 8px; border-radius: 4px; font-size: 12px;',
            'DECRYPT': 'color: #76FF03; font-weight: bold; background: #33691E; padding: 3px 8px; border-radius: 4px; font-size: 12px;'
        };

        // Create a collapsible group in the console for structured reading
        console.groupCollapsed(`%c[${stage}] %c${action}`, styles[stage], 'color: white; font-size: 13px; font-weight: bold; margin-left: 5px;');
        console.log(`%c⚙️ Algorithm:%c ${algorithm}`, 'font-weight: bold; color: #64B5F6; font-size: 12px;', 'color: inherit; font-size: 12px;');
        console.log(`%c📖 Concept:%c ${description}`, 'font-weight: bold; color: #81C784; font-size: 12px;', 'color: inherit; font-size: 12px; font-style: italic;');
        
        if (details) {
            console.log('%c🔍 Cryptographic Data:', 'font-weight: bold; color: #FFB74D; font-size: 12px;');
            const formattedDetails: any = {};
            
            for (const [key, value] of Object.entries(details)) {
                if (value instanceof Uint8Array) {
                    formattedDetails[key] = `${Encoding.toBase64(value).substring(0, 30)}... (Length: ${value.length} bytes)`;
                } else if (typeof value === 'string' && value.length > 60) {
                    // Prevent the massive ML-KEM base64 strings from ruining the table formatting
                    formattedDetails[key] = `${value.substring(0, 30)}... (Length: ${value.length} chars)`;
                } else {
                    formattedDetails[key] = value;
                }
            }
            
            console.table(formattedDetails); // Renders a clean table in the console
            
            // Allow clicking into the raw object to inspect the full 1,000+ byte arrays if needed
            console.log('%cRaw Object Data (Expandable):', 'color: gray; font-size: 10px;', details);
        }
        console.groupEnd();
    }
};