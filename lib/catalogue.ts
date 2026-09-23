// Curated catalogue of domestic destinations.
// Costs are rough per-person, per-day ground estimates (shared stay + food + local transport), in INR.
// They are deliberately shown to users as ranges labelled "estimate" (see PRD: The Cut).

export type Vibe =
  | "beach"
  | "mountains"
  | "city"
  | "heritage"
  | "adventure"
  | "relaxed"
  | "nature"
  | "nightlife"
  | "food";

export const VIBES: { id: Vibe; label: string }[] = [
  { id: "beach", label: "Beach" },
  { id: "mountains", label: "Mountains" },
  { id: "nature", label: "Nature & greenery" },
  { id: "adventure", label: "Adventure" },
  { id: "relaxed", label: "Slow & relaxed" },
  { id: "heritage", label: "Heritage & culture" },
  { id: "food", label: "Food" },
  { id: "nightlife", label: "Nightlife" },
  { id: "city", label: "City break" },
];

export type Dealbreaker =
  | "no_trek"
  | "no_cold"
  | "no_beach"
  | "no_party"
  | "no_flights"
  | "no_overnight"
  | "no_crowds";

export const DEALBREAKERS: { id: Dealbreaker; label: string }[] = [
  { id: "no_trek", label: "No treks / strenuous hikes" },
  { id: "no_cold", label: "No cold places" },
  { id: "no_beach", label: "No beach trips" },
  { id: "no_party", label: "No party-heavy places" },
  { id: "no_flights", label: "No flights" },
  { id: "no_overnight", label: "No journeys over 8 hrs one way" },
  { id: "no_crowds", label: "No crowded tourist spots" },
];

export type Destination = {
  id: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
  tags: Vibe[];
  dayCost: [number, number];
  accessHours: number; // extra last-mile hours from nearest rail/bus hub
  airHours?: number; // hours from the nearest usable airport (default: accessHours + 1)
  trek?: boolean; // main experience needs a trek
  party?: boolean;
  crowded?: boolean;
  flightOnly?: boolean; // practically needs a flight from anywhere
  coldMonths?: number[]; // 1-12
  offMonths?: number[]; // monsoon / closure / extreme heat
  offReason?: string;
};

export const DESTINATIONS: Destination[] = [
  { id: "goa", name: "North Goa", state: "Goa", lat: 15.55, lng: 73.75, tags: ["beach", "nightlife", "food", "relaxed"], dayCost: [2500, 5000], accessHours: 0.5, airHours: 1, party: true, crowded: true, offMonths: [6, 7, 8, 9], offReason: "monsoon, many shacks shut" },
  { id: "gokarna", name: "Gokarna", state: "Karnataka", lat: 14.55, lng: 74.32, tags: ["beach", "relaxed", "nature"], dayCost: [1500, 3000], accessHours: 1.5, airHours: 3.5, offMonths: [6, 7, 8, 9], offReason: "monsoon" },
  { id: "varkala", name: "Varkala", state: "Kerala", lat: 8.73, lng: 76.72, tags: ["beach", "relaxed", "food"], dayCost: [2000, 3500], accessHours: 1, airHours: 1.2, offMonths: [6, 7, 8], offReason: "monsoon" },
  { id: "pondicherry", name: "Pondicherry", state: "Puducherry", lat: 11.93, lng: 79.83, tags: ["beach", "heritage", "food", "city"], dayCost: [2000, 4000], accessHours: 0.5, airHours: 3, offMonths: [11], offReason: "north-east monsoon rains" },
  { id: "havelock", name: "Havelock, Andamans", state: "Andaman & Nicobar", lat: 11.97, lng: 92.99, tags: ["beach", "adventure", "nature"], dayCost: [4000, 8000], accessHours: 3, airHours: 3, flightOnly: true, offMonths: [5, 6, 7, 8, 9], offReason: "monsoon, rough seas" },
  { id: "alibaug", name: "Alibaug", state: "Maharashtra", lat: 18.64, lng: 72.87, tags: ["beach", "relaxed"], dayCost: [2500, 5000], accessHours: 1, airHours: 2.5, offMonths: [6, 7, 8], offReason: "monsoon" },
  { id: "alleppey", name: "Alleppey backwaters", state: "Kerala", lat: 9.49, lng: 76.34, tags: ["nature", "relaxed", "food"], dayCost: [2500, 5000], accessHours: 0.5, airHours: 1.5 },
  { id: "munnar", name: "Munnar", state: "Kerala", lat: 10.09, lng: 77.06, tags: ["mountains", "nature", "relaxed"], dayCost: [2000, 4000], accessHours: 1.5, airHours: 4, offMonths: [6, 7, 8], offReason: "heavy monsoon, landslide risk" },
  { id: "coorg", name: "Coorg", state: "Karnataka", lat: 12.42, lng: 75.74, tags: ["mountains", "nature", "relaxed", "food"], dayCost: [2500, 5000], accessHours: 1, airHours: 3, offMonths: [6, 7, 8], offReason: "heavy monsoon" },
  { id: "chikmagalur", name: "Chikmagalur", state: "Karnataka", lat: 13.32, lng: 75.77, tags: ["mountains", "nature", "adventure", "relaxed"], dayCost: [2000, 4000], accessHours: 1, airHours: 3.5, offMonths: [6, 7, 8], offReason: "heavy monsoon" },
  { id: "wayanad", name: "Wayanad", state: "Kerala", lat: 11.68, lng: 76.13, tags: ["nature", "mountains", "adventure"], dayCost: [2000, 4000], accessHours: 1, airHours: 2.5, offMonths: [6, 7, 8], offReason: "heavy monsoon, landslide risk" },
  { id: "ooty", name: "Ooty", state: "Tamil Nadu", lat: 11.41, lng: 76.7, tags: ["mountains", "relaxed", "nature"], dayCost: [2000, 4000], accessHours: 1.5, airHours: 3, crowded: true, coldMonths: [12, 1] },
  { id: "kodaikanal", name: "Kodaikanal", state: "Tamil Nadu", lat: 10.24, lng: 77.49, tags: ["mountains", "relaxed", "nature"], dayCost: [2000, 3500], accessHours: 2, airHours: 3.5, coldMonths: [12, 1] },
  { id: "hampi", name: "Hampi", state: "Karnataka", lat: 15.34, lng: 76.46, tags: ["heritage", "adventure", "relaxed"], dayCost: [1500, 3000], accessHours: 0.5, airHours: 2.5, offMonths: [4, 5], offReason: "extreme heat" },
  { id: "lonavala", name: "Lonavala", state: "Maharashtra", lat: 18.75, lng: 73.41, tags: ["mountains", "relaxed", "nature"], dayCost: [2000, 4000], accessHours: 0, airHours: 2, crowded: true },
  { id: "mahabaleshwar", name: "Mahabaleshwar", state: "Maharashtra", lat: 17.92, lng: 73.66, tags: ["mountains", "relaxed", "nature"], dayCost: [2000, 4000], accessHours: 1, airHours: 3.5, offMonths: [6, 7, 8], offReason: "monsoon closures" },
  { id: "udaipur", name: "Udaipur", state: "Rajasthan", lat: 24.58, lng: 73.71, tags: ["heritage", "city", "food", "relaxed"], dayCost: [2500, 5000], accessHours: 0.5, airHours: 0.7, offMonths: [4, 5, 6], offReason: "extreme heat" },
  { id: "jaipur", name: "Jaipur", state: "Rajasthan", lat: 26.91, lng: 75.79, tags: ["heritage", "city", "food"], dayCost: [2000, 4000], accessHours: 0, airHours: 0.5, crowded: true, offMonths: [4, 5, 6], offReason: "extreme heat" },
  { id: "jaisalmer", name: "Jaisalmer", state: "Rajasthan", lat: 26.91, lng: 70.92, tags: ["heritage", "adventure"], dayCost: [2000, 4500], accessHours: 1, airHours: 1, coldMonths: [12, 1], offMonths: [4, 5, 6, 7, 8], offReason: "extreme heat" },
  { id: "varanasi", name: "Varanasi", state: "Uttar Pradesh", lat: 25.32, lng: 83.01, tags: ["heritage", "food"], dayCost: [1500, 3000], accessHours: 0.5, airHours: 0.8, crowded: true, offMonths: [5, 6], offReason: "extreme heat" },
  { id: "rishikesh", name: "Rishikesh", state: "Uttarakhand", lat: 30.09, lng: 78.27, tags: ["adventure", "nature", "relaxed"], dayCost: [1500, 3500], accessHours: 1, airHours: 1, crowded: true, offMonths: [7, 8], offReason: "rafting closed in monsoon" },
  { id: "mussoorie", name: "Mussoorie", state: "Uttarakhand", lat: 30.46, lng: 78.07, tags: ["mountains", "relaxed"], dayCost: [2000, 4000], accessHours: 1.5, airHours: 1.8, crowded: true, coldMonths: [12, 1, 2] },
  { id: "nainital", name: "Nainital", state: "Uttarakhand", lat: 29.38, lng: 79.46, tags: ["mountains", "relaxed", "nature"], dayCost: [2000, 4000], accessHours: 1.5, airHours: 2.5, crowded: true, coldMonths: [12, 1, 2] },
  { id: "corbett", name: "Jim Corbett", state: "Uttarakhand", lat: 29.53, lng: 78.77, tags: ["nature", "adventure"], dayCost: [3000, 6000], accessHours: 1, airHours: 3, offMonths: [7, 8, 9], offReason: "core zones closed in monsoon" },
  { id: "shimla", name: "Shimla", state: "Himachal Pradesh", lat: 31.1, lng: 77.17, tags: ["mountains", "heritage", "relaxed"], dayCost: [2000, 4000], accessHours: 2, airHours: 3, crowded: true, coldMonths: [12, 1, 2] },
  { id: "manali", name: "Manali", state: "Himachal Pradesh", lat: 32.24, lng: 77.19, tags: ["mountains", "adventure", "nightlife", "nature"], dayCost: [2000, 4500], accessHours: 3, airHours: 2.5, crowded: true, coldMonths: [11, 12, 1, 2, 3] },
  { id: "kasol", name: "Kasol & Parvati Valley", state: "Himachal Pradesh", lat: 32.01, lng: 77.31, tags: ["mountains", "nature", "relaxed", "adventure"], dayCost: [1500, 3000], accessHours: 4, airHours: 3, trek: true, party: true, coldMonths: [11, 12, 1, 2, 3] },
  { id: "mcleodganj", name: "McLeod Ganj", state: "Himachal Pradesh", lat: 32.24, lng: 76.32, tags: ["mountains", "heritage", "relaxed", "food"], dayCost: [1500, 3000], accessHours: 2, airHours: 1, coldMonths: [12, 1, 2] },
  { id: "tirthan", name: "Tirthan Valley", state: "Himachal Pradesh", lat: 31.64, lng: 77.47, tags: ["nature", "mountains", "relaxed"], dayCost: [1800, 3500], accessHours: 3, airHours: 3, coldMonths: [12, 1, 2] },
  { id: "leh", name: "Leh", state: "Ladakh", lat: 34.15, lng: 77.58, tags: ["mountains", "adventure", "heritage"], dayCost: [3500, 7000], accessHours: 0.5, airHours: 0.3, flightOnly: true, coldMonths: [10, 11, 12, 1, 2, 3, 4], offMonths: [11, 12, 1, 2, 3], offReason: "deep winter, many routes shut" },
  { id: "darjeeling", name: "Darjeeling", state: "West Bengal", lat: 27.04, lng: 88.26, tags: ["mountains", "heritage", "relaxed", "food"], dayCost: [2000, 3500], accessHours: 3, airHours: 3, coldMonths: [12, 1, 2] },
  { id: "gangtok", name: "Gangtok", state: "Sikkim", lat: 27.33, lng: 88.61, tags: ["mountains", "nature", "heritage"], dayCost: [2500, 4500], accessHours: 4, airHours: 4, coldMonths: [12, 1, 2] },
  { id: "meghalaya", name: "Shillong & Cherrapunji", state: "Meghalaya", lat: 25.58, lng: 91.89, tags: ["nature", "adventure", "mountains"], dayCost: [2000, 4000], accessHours: 3, airHours: 3.5, trek: true, offMonths: [6, 7, 8], offReason: "extreme rainfall" },
];

export const CITIES: { id: string; name: string; lat: number; lng: number }[] = [
  { id: "bengaluru", name: "Bengaluru", lat: 12.97, lng: 77.59 },
  { id: "mumbai", name: "Mumbai", lat: 19.08, lng: 72.88 },
  { id: "delhi", name: "Delhi NCR", lat: 28.61, lng: 77.21 },
  { id: "hyderabad", name: "Hyderabad", lat: 17.39, lng: 78.49 },
  { id: "chennai", name: "Chennai", lat: 13.08, lng: 80.27 },
  { id: "pune", name: "Pune", lat: 18.52, lng: 73.86 },
  { id: "kolkata", name: "Kolkata", lat: 22.57, lng: 88.36 },
  { id: "ahmedabad", name: "Ahmedabad", lat: 23.02, lng: 72.57 },
  { id: "jaipur", name: "Jaipur", lat: 26.91, lng: 75.79 },
  { id: "chandigarh", name: "Chandigarh", lat: 30.73, lng: 76.78 },
  { id: "lucknow", name: "Lucknow", lat: 26.85, lng: 80.95 },
  { id: "indore", name: "Indore", lat: 22.72, lng: 75.86 },
  { id: "kochi", name: "Kochi", lat: 9.93, lng: 76.27 },
  { id: "guwahati", name: "Guwahati", lat: 26.14, lng: 91.74 },
];

/** Date the per-day costs and the distance model were last reviewed. Shown on every estimate's basis line. */
export const ESTIMATE_DATE = "2026-09-23";

export const destinationById = (id: string | null | undefined) => DESTINATIONS.find((d) => d.id === id);
export const cityById = (id: string | null | undefined) => CITIES.find((c) => c.id === id);
export const vibeLabel = (id: string) => VIBES.find((v) => v.id === id)?.label ?? id;
export const wontDoLabel = (id: string) => DEALBREAKERS.find((d) => d.id === id)?.label ?? id;

/** What a custom (non-catalogue) idea can declare it involves, so won't-dos can still be checked. */
export const ACTIVITIES: { id: string; label: string }[] = [
  { id: "trek", label: "A trek or strenuous hike" },
  { id: "beach", label: "Beach time" },
  { id: "party", label: "Party-heavy nights" },
  { id: "crowds", label: "Crowded tourist spots" },
  { id: "cold", label: "Cold weather" },
  { id: "flight", label: "Needs a flight" },
];
