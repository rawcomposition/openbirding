import type { Tag } from "./types";

export const tags: Tag[] = [
  {
    name: "Entrance Fee",
    id: "F1",
    category: "fees",
    icon: "Ticket",
    color: "text-red-500",
  },
  {
    name: "Parking Fee",
    id: "F2",
    category: "fees",
    icon: "Car",
    color: "text-orange-500",
  },
  {
    name: "Permit Fee",
    id: "F3",
    category: "fees",
    icon: "FileText",
    color: "text-yellow-500",
  },
  {
    name: "Guide Required",
    id: "A1",
    category: "access",
    icon: "UserCheck",
    color: "text-cyan-500",
  },
  {
    name: "Guests/Residents Only",
    id: "A2",
    category: "access",
    icon: "Users",
    color: "text-purple-500",
  },
  {
    name: "Permission Required",
    id: "A3",
    category: "access",
    icon: "Shield",
    color: "text-blue-500",
  },
  {
    name: "Special Transportation Required",
    id: "A5",
    category: "access",
    icon: "Bus",
    color: "text-emerald-500",
  },
  {
    name: "Seasonal Closure",
    id: "A4",
    category: "access",
    icon: "CalendarX",
    color: "text-amber-500",
  },
  {
    name: "Military Property",
    id: "A6",
    category: "access",
    icon: "ShieldAlert",
    color: "text-red-600",
  },
  {
    name: "High Crime Area",
    id: "S1",
    category: "safety",
    icon: "AlertTriangle",
    color: "text-red-800",
  },
  {
    name: "Conflict Zone",
    id: "S2",
    category: "safety",
    icon: "Zap",
    color: "text-orange-800",
  },
];

export const getTagsByCategory = () => {
  const categories = {
    fees: tags.filter((tag) => tag.category === "fees"),
    access: tags.filter((tag) => tag.category === "access"),
    safety: tags.filter((tag) => tag.category === "safety"),
  };
  return categories;
};
