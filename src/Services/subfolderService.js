import Subfolder from '../models/Subfolder.js';


const createRootSubfolder = async (createdBy, ledgerNo) => {
    const rootSubfolder = new Subfolder({
      name: 'Default Parent Folder',
      parentId: null, // Can be set to a number if needed
      createdBy,
      category: 'Default',
      ledgerNo,
    });
  
    await rootSubfolder.save();
    return rootSubfolder.parentId; // Return the numeric parentId
  };
  

export default createRootSubfolder;