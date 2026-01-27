import { SUBJECTS } from './categorySubjects';
import { MODIFIERS, BLOCKED } from './categoryTemplates';

function randomFrom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function isValid(mod: string, subject: string) {
    return !BLOCKED[mod]?.includes(subject);
}

const MODIFIER_CHANCE = 0.6;

export function generateTemplateCategory(): string {
    const subject = randomFrom(SUBJECTS);

    // 40% of the time, return the plain subject
    if (Math.random() > MODIFIER_CHANCE) {
        return subject;
    }

    // Otherwise, apply a valid modifier
    let modifier: string;
    do {
        modifier = randomFrom(MODIFIERS);
    } while (!isValid(modifier, subject));

    return `${modifier} ${subject}`;
}
