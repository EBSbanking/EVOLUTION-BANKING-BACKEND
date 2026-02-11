// fixAuditTrailError.js
import fs from 'fs';
import path from 'path';

const projectRoot = path.join(process.cwd(), '..');
const auditControllerPath = path.join(projectRoot, 'src', 'controllers', 'AudiTrailController.js');

console.log('🔧 Fixing AudiTrailController.js createAuditTrail function...\n');

let content = fs.readFileSync(auditControllerPath, 'utf8');

// Find the createAuditTrail function
const functionStart = content.indexOf('export const createAuditTrail = async (req, res) =>');
if (functionStart === -1) {
  console.error('❌ createAuditTrail function not found!');
  process.exit(1);
}

// Find the function body
const functionBodyStart = functionStart;
let functionBodyEnd = functionStart;
let braceCount = 0;

for (let i = functionStart; i < content.length; i++) {
  if (content[i] === '{') braceCount++;
  if (content[i] === '}') {
    braceCount--;
    if (braceCount === 0) {
      functionBodyEnd = i + 1;
      break;
    }
  }
}

const oldFunction = content.substring(functionStart, functionBodyEnd);
console.log('Found createAuditTrail function');

// Create the fixed function
const fixedFunction = `export const createAuditTrail = async (req, res) => {
  try {
    console.log('📨 Received POST /audit-trails:', req.body);
    
    // 🔥 FIX: Add null check for req.body
    if (!req || !req.body) {
      console.error('Invalid request or missing body in createAuditTrail');
      return res.status(400).json({
        success: false,
        message: 'Invalid request: Missing request body'
      });
    }
    
    const { 
      EVENT_TYPE, 
      USER_ID, 
      ACTION, 
      OLD_VALUE = null, 
      NEW_VALUE = {},  // Default to empty object
      IP_ADDRESS, 
      ENTITY_ID = '0',  // Default to '0' instead of undefined
      ENTITY_TYPE = 'general',
      BRANCH = 1,
      status
    } = req.body || {};
    
    const user_id = req.user_id || USER_ID;  // From middleware or body
    const ip_address = req.ip_address || IP_ADDRESS || req.ip || '0.0.0.0';

    console.log('🔍 Validating fields:', {
      EVENT_TYPE, user_id, ACTION, NEW_VALUE, ip_address
    });

    // Validate required fields
    const errors = [];
    if (!EVENT_TYPE) errors.push('EVENT_TYPE is required');
    if (!user_id) errors.push('USER_ID is required');
    if (!ACTION) errors.push('ACTION is required');
    
    if (errors.length > 0) {
      console.log('❌ Validation failed:', errors);
      return res.status(400).json({ 
        success: false,
        message: 'Missing required fields',
        errors 
      });
    }

    console.log('🚀 Calling addAuditTrail...');

    const auditEntry = await addAuditTrail({
      EVENT_TYPE,
      USER_ID: user_id,
      BRANCH,
      ACTION,
      OLD_VALUE,
      NEW_VALUE: NEW_VALUE || {},
      IP_ADDRESS: ip_address,
      ENTITY_ID: ENTITY_ID || '0',
      ENTITY_TYPE,
      additional_info: { 
        outcome: 'success', 
        source: 'manual_api',
        level: 'info',
        timestamp: new Date().toISOString(),
        status: status || 'SUCCESS'
      }
    });

    console.log('✅ Audit created successfully:', auditEntry?.event_id);

    return res.status(201).json({
      success: true,
      message: 'Audit trail entry created successfully',
      data: {
        event_id: auditEntry?.event_id,
        event_type: EVENT_TYPE,
        user_id: user_id,
        action: ACTION,
        timestamp: auditEntry?.created_at || new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('🔥 Error creating audit trail:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: error.message
    });
  }
}`;

// Replace the old function with the fixed one
const newContent = content.substring(0, functionStart) + fixedFunction + content.substring(functionBodyEnd);

fs.writeFileSync(auditControllerPath, newContent, 'utf8');
console.log('✅ Fixed createAuditTrail function');
console.log('\n⚠️ Also check autoCollectionService.js line 197 to ensure it calls createAuditTrail correctly');