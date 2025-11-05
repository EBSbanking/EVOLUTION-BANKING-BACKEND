import CustWorkflowRouting from '../models/CustWorkflowRouting.js';  // Ensure this is correct

// Fetch all workflow routings
export const getAllWorkflowRoutings = async (req, res) => {
    try {
        const workflows = await CustWorkflowRouting.find(); // Fetch all workflows from DB
        res.json(workflows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Fetch a workflow routing by USER_ID and WF_ROUTING_ID
export const getWorkflowRoutingById = async (req, res) => {
    try {
        const { userId, wfRoutingId } = req.params;
        console.log(`Querying for USER_ID: ${userId}, WF_ROUTING_ID: ${wfRoutingId}`); // Debug log
        
        const workflow = await CustWorkflowRouting.findOne({
            userId: userId,  // Ensure field name matches DB schema
            wfRoutingId: wfRoutingId  // Ensure field name matches DB schema
        });
        
        if (!workflow) {
            return res.status(404).json({ message: 'Workflow not found for this USER_ID and WF_ROUTING_ID' });
        }
        
        res.json(workflow);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Create a new workflow routing
export const createWorkflowRouting = async (req, res) => {
    try {
        const newWorkflow = new CustWorkflowRouting(req.body);
        const savedWorkflow = await newWorkflow.save();
        res.status(201).json(savedWorkflow);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update workflow routing by ID
export const updateWorkflowRoutingById = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedWorkflow = await CustWorkflowRouting.findByIdAndUpdate(id, req.body, { new: true });

        if (!updatedWorkflow) {
            return res.status(404).json({ message: 'Workflow not found' });
        }

        res.json(updatedWorkflow);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete workflow routing by ID
export const deleteWorkflowRoutingById = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedWorkflow = await CustWorkflowRouting.findByIdAndDelete(id);

        if (!deletedWorkflow) {
            return res.status(404).json({ message: 'Workflow not found' });
        }

        res.status(204).send();  // No content for successful deletion
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Find workflow routings by field and value
export const findWorkflowRoutingsByField = async (req, res) => {
    try {
        const { field, value } = req.params;

        // Dynamically build the query based on field name
        const query = {};
        query[field] = value;

        const workflows = await CustWorkflowRouting.find(query);

        if (workflows.length === 0) {
            return res.status(404).json({ message: `No workflows found for ${field} = ${value}` });
        }

        res.json(workflows);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
