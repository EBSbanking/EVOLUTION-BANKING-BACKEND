import mongoose from "mongoose";
export const States = [
    {
      "name": "Abia",
      "LOCAL_GOV": [
        { "name": "Aba North", "URBAN": true, "RURAL": false },
        { "name": "Aba South", "URBAN": true, "RURAL": false },
        { "name": "Isiala Ngwa North", "URBAN": false, "RURAL": true },
        { "name": "Isiala Ngwa South", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Adamawa",
      "LOCAL_GOV": [
        { "name": "Yola North", "URBAN": true, "RURAL": false },
        { "name": "Mubi North", "URBAN": false, "RURAL": true },
        { "name": "Michika", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Akwa Ibom",
      "LOCAL_GOV": [
        { "name": "Uyo", "URBAN": true, "RURAL": false },
        { "name": "Eket", "URBAN": true, "RURAL": false },
        { "name": "Ikot Abasi", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Anambra",
      "LOCAL_GOV": [
        { "name": "Awka", "URBAN": true, "RURAL": false },
        { "name": "Onitsha", "URBAN": true, "RURAL": false },
        { "name": "Oyi", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Bauchi",
      "LOCAL_GOV": [
        { "name": "Bauchi", "URBAN": true, "RURAL": false },
        { "name": "Azare", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Bayelsa",
      "LOCAL_GOV": [
        { "name": "Yenagoa", "URBAN": true, "RURAL": false },
        { "name": "Brass", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Benue",
      "LOCAL_GOV": [
        { "name": "Makurdi", "URBAN": true, "RURAL": false },
        { "name": "Gboko", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Borno",
      "LOCAL_GOV": [
        { "name": "Maiduguri", "URBAN": true, "RURAL": false },
        { "name": "Bama", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Cross River",
      "LOCAL_GOV": [
        { "name": "Calabar Municipal", "URBAN": true, "RURAL": false },
        { "name": "Obudu", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Delta",
      "LOCAL_GOV": [
        { "name": "Asaba", "URBAN": true, "RURAL": false },
        { "name": "Warri", "URBAN": true, "RURAL": false },
        { "name": "Udu", "URBAN": true, "RURAL": false },
        { "name": "Ethiope West", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Ebonyi",
      "LOCAL_GOV": [
        { "name": "Abakaliki", "URBAN": true, "RURAL": false },
        { "name": "Ikwo", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Edo",
      "LOCAL_GOV": [
        { "name": "Benin City", "URBAN": true, "RURAL": false },
        { "name": "Uromi", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Ekiti",
      "LOCAL_GOV": [
        { "name": "Ado-Ekiti", "URBAN": true, "RURAL": false },
        { "name": "Ikere", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Enugu",
      "LOCAL_GOV": [
        { "name": "Enugu South", "URBAN": true, "RURAL": false },
        { "name": "Nsukka", "URBAN": false, "RURAL": true },
        { "name": "Udi", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Gombe",
      "LOCAL_GOV": [
        { "name": "Gombe", "URBAN": true, "RURAL": false },
        { "name": "Kaltungo", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Imo",
      "LOCAL_GOV": [
        { "name": "Owerri Municipal", "URBAN": true, "RURAL": false },
        { "name": "Orlu", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Jigawa",
      "LOCAL_GOV": [
        { "name": "Dutse", "URBAN": true, "RURAL": false },
        { "name": "Hadejia", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Kaduna",
      "LOCAL_GOV": [
        { "name": "Kaduna North", "URBAN": true, "RURAL": false },
        { "name": "Zaria", "URBAN": true, "RURAL": false },
        { "name": "Jama'a", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Kano",
      "LOCAL_GOV": [
        { "name": "Kano Municipal", "URBAN": true, "RURAL": false },
        { "name": "Nasarawa", "URBAN": true, "RURAL": false },
        { "name": "Ungogo", "URBAN": true, "RURAL": false },
        { "name": "Rano", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Katsina",
      "LOCAL_GOV": [
        { "name": "Katsina", "URBAN": true, "RURAL": false },
        { "name": "Funtua", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Kebbi",
      "LOCAL_GOV": [
        { "name": "Birnin Kebbi", "URBAN": true, "RURAL": false },
        { "name": "Argungu", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Kogi",
      "LOCAL_GOV": [
        { "name": "Lokoja", "URBAN": true, "RURAL": false },
        { "name": "Idah", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Kwara",
      "LOCAL_GOV": [
        { "name": "Ilorin West", "URBAN": true, "RURAL": false },
        { "name": "Offa", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Lagos",
      "LOCAL_GOV": [
        { "name": "Ikeja", "URBAN": true, "RURAL": false },
        { "name": "Badagry", "URBAN": false, "RURAL": true },
        { "name": "Lekki", "URBAN": true, "RURAL": false },
        { "name": "Surulere", "URBAN": true, "RURAL": false },
        { "name": "Apapa", "URBAN": true, "RURAL": false }
      ]
    },
    {
      "name": "Nasarawa",
      "LOCAL_GOV": [
        { "name": "Lafia", "URBAN": true, "RURAL": false },
        { "name": "Karu", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Niger",
      "LOCAL_GOV": [
        { "name": "Minna", "URBAN": true, "RURAL": false },
        { "name": "Kontagora", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Ogun",
      "LOCAL_GOV": [
        { "name": "Abeokuta South", "URBAN": true, "RURAL": false },
        { "name": "Ijebu Ode", "URBAN": true, "RURAL": false },
        { "name": "Yewa North", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Ondo",
      "LOCAL_GOV": [
        { "name": "Akure North", "URBAN": true, "RURAL": false },
        { "name": "Owo", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Osun",
      "LOCAL_GOV": [
        { "name": "Osogbo", "URBAN": true, "RURAL": false },
        { "name": "Ilesa", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Oyo",
      "LOCAL_GOV": [
        { "name": "Ibadan North", "URBAN": true, "RURAL": false },
        { "name": "Oyo", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Plateau",
      "LOCAL_GOV": [
        { "name": "Jos North", "URBAN": true, "RURAL": false },
        { "name": "Shendam", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Rivers",
      "LOCAL_GOV": [
        { "name": "Port Harcourt", "URBAN": true, "RURAL": false },
        { "name": "Obio-Akpor", "URBAN": true, "RURAL": false },
        { "name": "Ahoada West", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Sokoto",
      "LOCAL_GOV": [
        { "name": "Sokoto North", "URBAN": true, "RURAL": false },
        { "name": "Tambuwal", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Taraba",
      "LOCAL_GOV": [
        { "name": "Jalingo", "URBAN": true, "RURAL": false },
        { "name": "Wukari", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Yobe",
      "LOCAL_GOV": [
        { "name": "Damaturu", "URBAN": true, "RURAL": false },
        { "name": "Potiskum", "URBAN": false, "RURAL": true }
      ]
    },
    {
      "name": "Zamfara",
      "LOCAL_GOV": [
        { "name": "Gusau", "URBAN": true, "RURAL": false },
        { "name": "Shinkafi", "URBAN": false, "RURAL": true }
      ]
    }
  ]
  export default States;