import express from 'express';
     import asyncHandler from 'express-async-handler';
     import { restrictToPermission } from '../middlewares/rbac.js';
     import AML from '../models/AML.js';
     import AuditTrail from '../models/AuditTrail.js';
     import WFWorkItem from '../models/WF_WORK_ITEM.js';
     import WorkflowSubprocess from '../models/WF_SUB_PROCESS.js';
     import Transaction from '../models/Transaction.js';
     import Holiday from '../models/Holiday.js';
     import LoanAccount from '../models/LoanAccount.js';

     const router = express.Router();

     // AML Module
     router.get('/aml/threshold', restrictToPermission('amlThreshold'), asyncHandler(async (req, res) => {
       const config = await AML.findOne();
       res.json({ success: true, data: config || { threshold: 10000 } });
     }));
     router.post('/aml/approval', restrictToPermission('amlApproval'), asyncHandler(async (req, res) => {
       const { loanId, status } = req.body;
       const loan = await LoanAccount.findByIdAndUpdate(loanId, { amlStatus: status }, { new: true });
       res.json({ success: true, message: 'AML approval updated', data: loan });
     }));
     router.post('/aml/configure', restrictToPermission('configureAML'), asyncHandler(async (req, res) => {
       const configData = req.body;
       const config = await AML.findOneAndUpdate({}, configData, { upsert: true, new: true });
       res.json({ success: true, message: 'AML configuration updated', data: config });
     }));
     router.get('/aml/monitor', restrictToPermission('monitorAML'), asyncHandler(async (req, res) => {
       const transactions = await Transaction.find({ amlFlagged: true });
       res.json({ success: true, data: transactions });
     }));
     router.get('/aml/reports', restrictToPermission('generateAMLReport'), asyncHandler(async (req, res) => {
       const reports = await Report.find({ type: 'aml_report' });
       res.json({ success: true, data: reports });
     }));
     router.post('/aml/suspend-transaction', restrictToPermission('suspendAMLTransaction'), asyncHandler(async (req, res) => {
       const { transactionId } = req.body;
       const transaction = await Transaction.findByIdAndUpdate(transactionId, { status: 'suspended' }, { new: true });
       res.json({ success: true, message: 'Transaction suspended', data: transaction });
     }));

     // Audit Trail
     router.get('/audit-trail', restrictToPermission('auditTrail'), asyncHandler(async (req, res) => {
       const auditLogs = await AuditTrail.find();
       res.json({ success: true, data: auditLogs });
     }));

     // Workflow Module
     router.post('/workflows', restrictToPermission('workflowSetup'), asyncHandler(async (req, res) => {
       const workflowData = req.body;
       const workflow = new WFWorkItem(workflowData);
       await workflow.save();
       res.json({ success: true, message: 'Workflow created', data: workflow });
     }));
     router.post('/workflows/subprocess', restrictToPermission('workflowSubProcess'), asyncHandler(async (req, res) => {
       const subprocessData = req.body;
       const subprocess = new WorkflowSubprocess(subprocessData);
       await subprocess.save();
       res.json({ success: true, message: 'Workflow subprocess created', data: subprocess });
     }));
     router.get('/workflows/:id', restrictToPermission('workflowItemDetails'), asyncHandler(async (req, res) => {
       const workflow = await WFWorkItem.findById(req.params.id);
       if (!workflow) {
         return res.status(404).json({ success: false, message: 'Workflow not found' });
       }
       res.json({ success: true, data: workflow });
     }));

     // Report Module
     router.get('/reports/all', restrictToPermission('reports'), asyncHandler(async (req, res) => {
       const reports = await Report.find();
       res.json({ success: true, data: reports });
     }));
     router.get('/reports/org/view', restrictToPermission('orgReportsView'), asyncHandler(async (req, res) => {
       const reports = await Report.find({ type: 'org_report' });
       res.json({ success: true, data: reports });
     }));
     router.post('/reports/org/add', restrictToPermission('addOrgReports'), asyncHandler(async (req, res) => {
       const reportData = req.body;
       const report = new Report({ ...reportData, type: 'org_report' });
       await report.save();
       res.json({ success: true, message: 'Organizational report added', data: report });
     }));

     // Holiday Management
     router.post('/holidays', restrictToPermission('holidayCalendar'), asyncHandler(async (req, res) => {
       const holidayData = req.body;
       const holiday = new Holiday(holidayData);
       await holiday.save();
       res.json({ success: true, message: 'Holiday created', data: holiday });
     }));

     // System Utilities
     router.get('/license-details', restrictToPermission('licenseDetails'), asyncHandler(async (req, res) => {
       res.json({ success: true, data: { license: 'Enterprise' } });
     }));
     router.get('/system-date', restrictToPermission('systemDate'), asyncHandler(async (req, res) => {
       res.json({ success: true, data: { date: new Date() } });
     }));
     router.post('/os-trigger', restrictToPermission('osTrigger'), asyncHandler(async (req, res) => {
       res.json({ success: true, message: 'OS trigger executed' });
     }));

     export default router;