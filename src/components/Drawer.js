// src/components/Drawer.js
import React from 'react';
import { Drawer, List, ListItem, ListItemText, Divider } from '@mui/material';

const Drawer = ({ open, onClose, userRole }) => {
    // Handler function for menu item clicks
    const handleMenuItemClick = (action) => {
        console.log(`${action} clicked`);
        // Implement navigation or action handling here
    };

    // Define accessible menu items based on user role
    const menuItems = {
        admin: [
            { text: "Home", action: "Home" },
            { text: "My Account", action: "My Account" },
            { text: "Transactions", action: "Transactions" },
            { text: "Settings", action: "Settings" },
            { text: "Cash Depot", action: "Cash Depot" },
            { text: "Clearing Cheque Enquiry", action: "Clearing Cheque Enquiry" },
            { text: "Currency Denomination Exchange", action: "Currency Denomination Exchange" },
            { text: "Depot to Vault Transaction", action: "Depot to Vault Transaction" },
            { text: "Drawer", action: "Drawer" },
            { text: "Drawer Balance & Close Out", action: "Drawer Balance & Close Out" },
            { text: "Drawer Cash Journal Enquiry", action: "Drawer Cash Journal Enquiry" },
            { text: "Drawer Enquiry", action: "Drawer Enquiry" },
            { text: "Drawer to Drawer Transaction", action: "Drawer to Drawer Transaction" },
            { text: "Drawer to Vault Transaction", action: "Drawer to Vault Transaction" },
            { text: "Maintain Vault Currency", action: "Maintain Vault Currency" },
            { text: "Manage Vault Operation", action: "Manage Vault Operation" },
            { text: "Open Drawer", action: "Open Drawer" },
            { text: "Supervisor Drawer to Drawer Transaction", action: "Supervisor Drawer to Drawer Transaction" },
            { text: "Vault Enquiry", action: "Vault Enquiry" },
            { text: "Vault to Depot Transaction", action: "Vault to Depot Transaction" },
            { text: "Vault to Drawer Transaction", action: "Vault to Drawer Transaction" },
            { text: "Logout", action: "Logout" },
        ],
        user: [
            { text: "Home", action: "Home" },
            { text: "My Account", action: "My Account" },
            { text: "Transactions", action: "Transactions" },
            { text: "Logout", action: "Logout" },
        ],
        // Add more roles as needed
    };

    // Get menu items based on user role
    const accessibleItems = menuItems[userRole] || [];

    return (
        <Drawer anchor="left" open={open} onClose={onClose}>
            <div
                role="presentation"
                onClick={onClose}
                onKeyDown={onClose}
            >
                <List>
                    {accessibleItems.map(item => (
                        <ListItem button key={item.action} onClick={() => handleMenuItemClick(item.action)}>
                            <ListItemText primary={item.text} />
                        </ListItem>
                    ))}
                </List>
                <Divider />
            </div>
        </Drawer>
    );
};

export default Drawer;
