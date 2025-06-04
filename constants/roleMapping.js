import mongoose from 'mongoose'; // Ensure mongoose is imported
import BusinessUnit from '../models/BusinessUnit.js'; // Import the BusinessUnit model

// Role mapping that only stores role names
export const ROLE_MAPPING = {
  "Administrator": 'Administrator',
  "Head Banking Services": 'Head Banking Services',
  "Loan Processing Officer": 'Loan Processing Officer',
  "Senior Financial Accountant": 'Senior Financial Accountant',
  "Internal Control Officer": 'Internal Control Officer',
  "Internal Control Manager": 'Internal Control Manager',
  "Head of Credit": 'Head of Credit',
  "Head Human Resources": 'Head Human Resources',
  "Human Resource Officer": 'Human Resource Officer',
  "IT Manager": 'IT Manager',
  "Financial Accountant": 'Financial Accountant',
  "Financial Accountant Manager": 'Financial Accountant Manager',
  "Chief Financial Officer": 'Chief Financial Officer',
  "Chief Executive Officer": 'Chief Executive Officer',
  "Treasurer": 'Treasurer',
  "Loan Processing Supervisor": 'Loan Processing Supervisor',
  "Branch Manager": 'Branch Manager',
  "Branch Operation Supervisor": 'Branch Operation Supervisor',
  "Chief Operation Officer": 'Chief Operation Officer',
  "Marketing Manager": 'Marketing Manager',
  "Payment and Reconciliation USD": 'Payment and Reconciliation USD',
  "EOD Operator": 'EOD Operator',
  "Recovery Officer": 'Recovery Officer',
  "Relationship Development Officer": 'Relationship Development Officer',
  "Customer Relationship Officer": 'Customer Relationship Officer',
  "Customer Service Officer": 'Customer Service Officer',
  "Teller": 'Teller',
  "Head Teller": 'Head Teller',
  "Customer Relationship Supervisor": 'Customer Relationship Supervisor',
  "Recovery Team Lead": 'Recovery Team Lead',
  "Business Analyst": 'Business Analyst',
  "Credit Risk Analyst": 'Credit Risk Analyst',
  "Head of Digital Banking": 'Head of Digital Banking',
  "Agency Banking Officer": 'Agency Banking Officer',
  "Channel Manager": 'Channel Manager',
};

// Placeholder for business units (bank branches)
export const BUSINESS_UNIT_MAPPING = {};

// Function to fetch business units from the database and populate the mapping
export async function populateBusinessUnitMapping() {
  try {
    // Fetch all business units from the BusinessUnit collection
    const businessUnits = await BusinessUnit.find();

    // Iterate through each business unit and dynamically map it to the roles
    businessUnits.forEach(bu => {
      const { BUSINESS_UNIT, BU_ID } = bu; // Destructure necessary data

      // Example: Map the role to the respective business unit (branch)
      BUSINESS_UNIT_MAPPING[BUSINESS_UNIT] = BU_ID;
    });
  } catch (error) {
    console.error("Error fetching business units: ", error);
  }
}

// This function can be used to map business units dynamically to roles when they are created
export function mapRoleToBusinessUnit(role, branchName) {
  // Assigning the business unit (branch) to the role dynamically
  BUSINESS_UNIT_MAPPING[role] = branchName;
}

// Export ROLE_MAPPING and BUSINESS_UNIT_MAPPING for use in other files
export default { ROLE_MAPPING, BUSINESS_UNIT_MAPPING, populateBusinessUnitMapping, mapRoleToBusinessUnit };
