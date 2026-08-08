// utils/approvalUtils.js
import ApprovalWorkflowConfig from '../models/ApprovalWorkflowConfig.js';
import { ROLES } from './roleConstants.js';

export const getNextApproverRoleId = async (requestType, currentLevel, branchCode, organizationName) => {
  const config = await ApprovalWorkflowConfig.getConfigForRequest(
    requestType, 
    branchCode, 
    organizationName
  );
  
  if (!config) return null;
  
  const levels = config.getApprovalLevels();
  const nextLevel = currentLevel + 1;
  const nextApprover = levels.find(level => level.level === nextLevel);
  
  return nextApprover ? nextApprover.roleId : null;
};

export const hasApprovalAuthority = (userRoleId, request, config) => {
  // Admin and CEO can approve anything
  if ([ROLES.ADMINISTRATOR, ROLES.CHIEF_EXECUTIVE_OFFICER].includes(userRoleId)) {
    return true;
  }
  
  const levels = config.getApprovalLevels();
  const currentLevel = request.approvalLevel;
  
  // Check if user's role matches the current approval level
  const levelConfig = levels.find(level => level.level === currentLevel + 1);
  if (!levelConfig) return false;
  
  return userRoleId === levelConfig.roleId;
};

export const getApprovalLevelStatus = (approvalLevel, approvalLevels) => {
  const totalLevels = approvalLevels.length;
  const currentLevel = approvalLevel;
  
  return {
    current: currentLevel,
    total: totalLevels,
    progress: totalLevels > 0 ? Math.round((currentLevel / totalLevels) * 100) : 0,
    isComplete: currentLevel >= totalLevels,
    pending: totalLevels - currentLevel,
    nextApprover: currentLevel < totalLevels ? approvalLevels[currentLevel] : null
  };
};