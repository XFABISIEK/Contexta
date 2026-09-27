import { Wrench } from "lucide-react";
import ponytailIcon from "../assets/skills/ponytail.png";

export function skillIconSource(name: string, icon?: string | null) {
  return icon || (/^ponytail(?:$|[-_: ])/.test(name.toLowerCase()) ? ponytailIcon : null);
}

export function SkillIcon({ name, icon }: { name: string; icon?: string | null }) {
  const source = skillIconSource(name, icon);
  return source ? <img className="skill-mark" src={source} alt="" aria-hidden="true" /> : <Wrench aria-hidden="true" />;
}
