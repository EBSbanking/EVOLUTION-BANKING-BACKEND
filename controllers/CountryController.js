import Country from '../models/Country.js';  // Adjust path if necessary


// Define Nigerian states and LGAs data
const States = [
  {
    name: "Abia",
    LOCAL_GOV: [
      { name: "Aba North", URBAN: true, RURAL: false },
      { name: "Aba South", URBAN: true, RURAL: false },
      { name: "Isiala Ngwa North", URBAN: false, RURAL: true },
      { name: "Isiala Ngwa South", URBAN: false, RURAL: true },
      { name: "Umuahia North", URBAN: false, RURAL: true },
      { name: "Umuahia South", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Adamawa",
    LOCAL_GOV: [
      { name: "Yola North", URBAN: true, RURAL: false },
      { name: "Yola South", URBAN: false, RURAL: true },
      { name: "Ganye", URBAN: false, RURAL: true },
      { name: "Mubi North", URBAN: false, RURAL: true },
      { name: "Mubi South", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Akwa Ibom",
    LOCAL_GOV: [
      { name: "Uyo", URBAN: true, RURAL: false },
      { name: "Ikot Ekpene", URBAN: true, RURAL: false },
      { name: "Abak", URBAN: false, RURAL: true },
      { name: "Essien Udim", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Anambra",
    LOCAL_GOV: [
      { name: "Awka North", URBAN: false, RURAL: true },
      { name: "Awka South", URBAN: true, RURAL: false },
      { name: "Onitsha North", URBAN: true, RURAL: false },
      { name: "Onitsha South", URBAN: true, RURAL: false }
    ]
  },
  {
    name: "Bauchi",
    LOCAL_GOV: [
      { name: "Bauchi", URBAN: true, RURAL: false },
      { name: "Azare", URBAN: false, RURAL: true },
      { name: "Katagum", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Bayelsa",
    LOCAL_GOV: [
      { name: "Yenagoa", URBAN: true, RURAL: false },
      { name: "Brass", URBAN: false, RURAL: true },
      { name: "Sagbama", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Benue",
    LOCAL_GOV: [
      { name: "Makurdi", URBAN: true, RURAL: false },
      { name: "Gboko", URBAN: false, RURAL: true },
      { name: "Otukpo", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Borno",
    LOCAL_GOV: [
      { name: "Maiduguri", URBAN: true, RURAL: false },
      { name: "Jere", URBAN: false, RURAL: true },
      { name: "Biu", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Cross River",
    LOCAL_GOV: [
      { name: "Calabar South", URBAN: true, RURAL: false },
      { name: "Calabar Municipal", URBAN: true, RURAL: false },
      { name: "Odukpani", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Delta",
    LOCAL_GOV: [
      { name: "Asaba", URBAN: true, RURAL: false },
      { name: "Warri South", URBAN: true, RURAL: false },
      { name: "Uvwie", URBAN: true, RURAL: false }
    ]
  },
  {
    name: "Ebonyi",
    LOCAL_GOV: [
      { name: "Abakaliki", URBAN: true, RURAL: false },
      { name: "Ikwo", URBAN: false, RURAL: true },
      { name: "Ebonyi", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Edo",
    LOCAL_GOV: [
      { name: "Benin City", URBAN: true, RURAL: false },
      { name: "Esan", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Ekiti",
    LOCAL_GOV: [
      { name: "Ado Ekiti", URBAN: true, RURAL: false },
      { name: "Ikere Ekiti", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Enugu",
    LOCAL_GOV: [
      { name: "Enugu East", URBAN: true, RURAL: false },
      { name: "Enugu North", URBAN: true, RURAL: false }
    ]
  },
  {
    name: "Gombe",
    LOCAL_GOV: [
      { name: "Gombe", URBAN: true, RURAL: false },
      { name: "Kaltungo", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Imo",
    LOCAL_GOV: [
      { name: "Owerri Municipal", URBAN: true, RURAL: false },
      { name: "Mbaitoli", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Jigawa",
    LOCAL_GOV: [
      { name: "Dutse", URBAN: true, RURAL: false },
      { name: "Hadejia", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Kaduna",
    LOCAL_GOV: [
      { name: "Kaduna North", URBAN: true, RURAL: false },
      { name: "Kaduna South", URBAN: true, RURAL: false }
    ]
  },
  {
    name: "Kano",
    LOCAL_GOV: [
      { name: "Kano Municipal", URBAN: true, RURAL: false },
      { name: "Kumbotso", URBAN: true, RURAL: false }
    ]
  },
  {
    name: "Katsina",
    LOCAL_GOV: [
      { name: "Katsina", URBAN: true, RURAL: false },
      { name: "Daura", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Kebbi",
    LOCAL_GOV: [
      { name: "Birnin Kebbi", URBAN: true, RURAL: false },
      { name: "Argungu", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Kogi",
    LOCAL_GOV: [
      { name: "Lokoja", URBAN: true, RURAL: false },
      { name: "Idah", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Kwara",
    LOCAL_GOV: [
      { name: "Ilorin", URBAN: true, RURAL: false },
      { name: "Offa", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Lagos",
    LOCAL_GOV: [
      { name: "Ikeja", URBAN: true, RURAL: false },
      { name: "Lagos Island", URBAN: true, RURAL: false }
    ]
  },
  {
    name: "Nasarawa",
    LOCAL_GOV: [
      { name: "Lafia", URBAN: true, RURAL: false },
      { name: "Akwanga", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Niger",
    LOCAL_GOV: [
      { name: "Minna", URBAN: true, RURAL: false },
      { name: "Bida", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Ogun",
    LOCAL_GOV: [
      { name: "Abeokuta", URBAN: true, RURAL: false },
      { name: "Ijebu-Ode", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Ondo",
    LOCAL_GOV: [
      { name: "Akure", URBAN: true, RURAL: false },
      { name: "Owo", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Osun",
    LOCAL_GOV: [
      { name: "Osogbo", URBAN: true, RURAL: false },
      { name: "Ilesa", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Oyo",
    LOCAL_GOV: [
      { name: "Ibadan", URBAN: true, RURAL: false },
      { name: "Oyo", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Plateau",
    LOCAL_GOV: [
      { name: "Jos North", URBAN: true, RURAL: false },
      { name: "Jos South", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Rivers",
    LOCAL_GOV: [
      { name: "Port Harcourt", URBAN: true, RURAL: false },
      { name: "Obio-Akpor", URBAN: true, RURAL: false }
    ]
  },
  {
    name: "Sokoto",
    LOCAL_GOV: [
      { name: "Sokoto North", URBAN: true, RURAL: false },
      { name: "Sokoto South", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Taraba",
    LOCAL_GOV: [
      { name: "Jalingo", URBAN: true, RURAL: false },
      { name: "Wukari", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Yobe",
    LOCAL_GOV: [
      { name: "Damaturu", URBAN: true, RURAL: false },
      { name: "Bade", URBAN: false, RURAL: true }
    ]
  },
  {
    name: "Zamfara",
    LOCAL_GOV: [
      { name: "Gusau", URBAN: true, RURAL: false },
      { name: "Maru", URBAN: false, RURAL: true }
    ]
  }
];


// Create a new country
export const createCountry = async (req, res) => {
    try {
      const { COUNTRY_NM } = req.body;
  
      const newCountry = new Country({
        COUNTRY_ID: "Nigeria", // Set country ID as "Nigeria"
        COUNTRY_NM,
        STATE: States
      });
  
      const country = await newCountry.save();
      res.status(201).json(country);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to create country' });
    }
  };
  
  // Get all countries
  export const getAllCountries = async (req, res) => {
    try {
      const countries = await Country.find();
      res.status(200).json(countries);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to fetch countries' });
    }
  };
  
  // Get country by ID
  export const getCountryById = async (req, res) => {
    const { id } = req.params;
  
    try {
      const country = await Country.findById(id);
      if (!country) {
        return res.status(404).json({ message: 'Country not found' });
      }
      res.status(200).json(country);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to fetch country' });
    }
  };
  
  // Update country by ID
  export const updateCountry = async (req, res) => {
    const { id } = req.params;
    const { COUNTRY_ID, COUNTRY_NM, STATE } = req.body;
  
    try {
      const updatedCountry = await Country.findByIdAndUpdate(
        id,
        { COUNTRY_ID, COUNTRY_NM, STATE },
        { new: true }  // Returns the updated country document
      );
  
      if (!updatedCountry) {
        return res.status(404).json({ message: 'Country not found' });
      }
      res.status(200).json(updatedCountry);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to update country' });
    }
  };
  
  // Delete country by ID
  export const deleteCountry = async (req, res) => {
    const { id } = req.params;
  
    try {
      const deletedCountry = await Country.findByIdAndDelete(id);
      if (!deletedCountry) {
        return res.status(404).json({ message: 'Country not found' });
      }
      res.status(200).json({ message: 'Country deleted successfully' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Failed to delete country' });
    }
  };