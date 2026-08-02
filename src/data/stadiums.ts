import type { Stadium } from './types';

export const STADIUMS: Stadium[] = [
  { id: 'etihad', name: 'Etihad Stadium', city: 'Manchester', capacity: 53400, seatColor: '#6BB7D6', seatColorAlt: '#2E4F63', roof: 'partial' },
  { id: 'oldtrafford', name: 'Old Trafford', city: 'Manchester', capacity: 74310, seatColor: '#B32530', seatColorAlt: '#5A1218', roof: 'partial' },
  { id: 'anfield', name: 'Anfield', city: 'Liverpool', capacity: 61276, seatColor: '#C8102E', seatColorAlt: '#5E0A17', roof: 'partial' },
  { id: 'stamford', name: 'Stamford Bridge', city: 'London', capacity: 40343, seatColor: '#034694', seatColorAlt: '#03264E', roof: 'partial' },
  { id: 'tottenham', name: 'Tottenham Hotspur Stadium', city: 'London', capacity: 62850, seatColor: '#132257', seatColorAlt: '#0A1233', roof: 'closed' },
  { id: 'emirates', name: 'Emirates Stadium', city: 'London', capacity: 60704, seatColor: '#9C1C2C', seatColorAlt: '#4A0D15', roof: 'partial' },
  { id: 'stjames', name: "St James' Park", city: 'Newcastle', capacity: 52305, seatColor: '#1B1B1B', seatColorAlt: '#3A3A3A', roof: 'partial' },
  { id: 'villapark', name: 'Villa Park', city: 'Birmingham', capacity: 42682, seatColor: '#670E36', seatColorAlt: '#33061B', roof: 'partial' },
  { id: 'bernabeu', name: 'Santiago Bernabéu', city: 'Madrid', capacity: 78297, seatColor: '#E3E3E3', seatColorAlt: '#8C8C8C', roof: 'closed' },
  { id: 'campnou', name: 'Spotify Camp Nou', city: 'Barcelona', capacity: 99354, seatColor: '#A50044', seatColorAlt: '#004D98', roof: 'partial' },
  { id: 'metropolitano', name: 'Riyadh Air Metropolitano', city: 'Madrid', capacity: 70460, seatColor: '#CB3524', seatColorAlt: '#262626', roof: 'closed' },
  { id: 'sanmames', name: 'San Mamés', city: 'Bilbao', capacity: 53289, seatColor: '#EE2523', seatColorAlt: '#6B1210', roof: 'closed' },
  { id: 'sansiro', name: 'San Siro', city: 'Milan', capacity: 75923, seatColor: '#B4121B', seatColorAlt: '#1B1B1B', roof: 'partial' },
  { id: 'allianzstadium', name: 'Allianz Stadium', city: 'Turin', capacity: 41507, seatColor: '#1C1C1C', seatColorAlt: '#4A4A4A', roof: 'closed' },
  { id: 'maradona', name: 'Stadio Diego Armando Maradona', city: 'Naples', capacity: 54726, seatColor: '#12A0D7', seatColorAlt: '#0A5772', roof: 'open' },
  { id: 'allianzarena', name: 'Allianz Arena', city: 'Munich', capacity: 75024, seatColor: '#DC052D', seatColorAlt: '#7A0319', roof: 'closed' },
  { id: 'signaliduna', name: 'Signal Iduna Park', city: 'Dortmund', capacity: 81365, seatColor: '#FDE100', seatColorAlt: '#1A1A1A', roof: 'partial' },
  { id: 'bayarena', name: 'BayArena', city: 'Leverkusen', capacity: 30210, seatColor: '#E32221', seatColorAlt: '#1A1A1A', roof: 'closed' },
  { id: 'redbullarena', name: 'Red Bull Arena', city: 'Leipzig', capacity: 47069, seatColor: '#DD0741', seatColorAlt: '#001F47', roof: 'partial' },
  { id: 'parcdesprinces', name: 'Parc des Princes', city: 'Paris', capacity: 47929, seatColor: '#004170', seatColorAlt: '#DA291C', roof: 'closed' },
  { id: 'velodrome', name: 'Orange Vélodrome', city: 'Marseille', capacity: 67394, seatColor: '#2FAEE0', seatColorAlt: '#0E4A63', roof: 'closed' },
  { id: 'louisii', name: 'Stade Louis II', city: 'Monaco', capacity: 18523, seatColor: '#CE1126', seatColorAlt: '#E8E8E8', roof: 'partial' },
  { id: 'groupama', name: 'Groupama Stadium', city: 'Lyon', capacity: 59186, seatColor: '#D6001C', seatColorAlt: '#0B3C7E', roof: 'partial' },
];

export const getStadium = (id: string): Stadium =>
  STADIUMS.find((st) => st.id === id) ?? STADIUMS[0];
