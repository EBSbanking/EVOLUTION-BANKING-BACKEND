// models/CreditRiskModel.js
import mongoose from 'mongoose';

const CreditRiskModelSchema = new mongoose.Schema({
  customerId: { type: String, required: true },
  creditScore: { type: Number, required: true },
  riskCategory: { type: String, enum: ['Low', 'Medium', 'High'], required: true },
  amlRiskScore: { type: Number, required: true },
  amlFlag: { type: Boolean, required: true },
  features: { type: mongoose.Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model('CreditRiskModel', CreditRiskModelSchema);


// controllers/CreditRiskController.js
import CreditRiskModel from '../models/CreditRiskModel.js';
import { evaluateCreditRisk, evaluateAmlRisk } from '../services/RiskEvaluatorService.js';

export const assessCustomerRisk = async (req, res) => {
  try {
    const { customerId, features } = req.body;

    // Step 1: Evaluate credit score and category
    const { creditScore, riskCategory } = await evaluateCreditRisk(features);

    // Step 2: Evaluate AML score and flag
    const { amlRiskScore, amlFlag } = await evaluateAmlRisk(features);

    // Step 3: Save result to database
    const riskAssessment = new CreditRiskModel({
      customerId,
      creditScore,
      riskCategory,
      amlRiskScore,
      amlFlag,
      features,
    });

    await riskAssessment.save();

    res.status(200).json({ success: true, data: riskAssessment });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Risk assessment failed', error: error.message });
  }
};


// services/RiskEvaluatorService.js
export const evaluateCreditRisk = async (features) => {
  // Mock logic: real implementation would use ML model or scoring logic
  const score = 650 + Math.random() * 100;
  let riskCategory = 'Medium';
  if (score >= 750) riskCategory = 'Low';
  if (score < 650) riskCategory = 'High';

  return { creditScore: Math.round(score), riskCategory };
};

export const evaluateAmlRisk = async (features) => {
  // Simple AML flag logic for demo purposes
  const amlScore = Math.random() * 100;
  const amlFlag = amlScore > 75; // flag if above threshold

  return { amlRiskScore: Math.round(amlScore), amlFlag };
};



"creditScoreDate": "2024-12-01",
    "isPoliticallyExposed": false,
    "riskRating": "Low",
    "creditScore": 720,
    "numberOfDependents": 2,
    "consentObtained": true,
    "consentDate": "2024-01-01",
    "consentMethod": "Digital"
  }
}