import React from 'react';
import './CustomerCategories.css';

const customerCategories = [
    { REF_KEY: 'PER', REF_DESC: 'PERSONAL' },
    { REF_KEY: '3PP', REF_DESC: 'THIRD PARTY PERSONAL' },
    { REF_KEY: '3PN', REF_DESC: 'THIRD PARTY NON-PERSONAL' },
    { REF_KEY: 'GRP', REF_DESC: 'GROUP' },
    { REF_KEY: 'COR', REF_DESC: 'CORPORATE' },
    { REF_KEY: 'FIN', REF_DESC: 'FINANCIAL INSTITUTION' },
    { REF_KEY: 'GOVT', REF_DESC: 'GOVERNMENT' },
    { REF_KEY: 'ASSOC', REF_DESC: 'ASSOCIATION, SOCIETY AND CLUB' },
    { REF_KEY: 'NGO', REF_DESC: 'NON-GOVERNMENTAL ORGANIZATION' },
];

const CustomerCategories = ({ setSelectedType }) => {
    const handleChange = (event) => {
        setSelectedType(event.target.value); // Pass selected value to the parent
    };

    return (
        <div>
            <label>Select Customer Category:</label>
            <select onChange={handleChange}>
                <option value="" disabled>Select a customer category</option>
                {customerCategories.map((category) => (
                    <option key={category.REF_KEY} value={category.REF_KEY}>
                        {category.REF_DESC}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default CustomerCategories;
