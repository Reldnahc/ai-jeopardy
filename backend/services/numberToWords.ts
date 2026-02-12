// src/utils/numberToWords.ts

const BELOW_20 = [
    "zero","one","two","three","four","five","six","seven","eight","nine",
    "ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen",
    "seventeen","eighteen","nineteen"
];

const TENS = [
    "", "", "twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"
];

function convertHundreds(num: number): string {
    let result = "";

    if (num >= 100) {
        result += BELOW_20[Math.floor(num / 100)] + " hundred";
        num %= 100;
        if (num > 0) result += " ";
    }

    if (num >= 20) {
        result += TENS[Math.floor(num / 10)];
        num %= 10;
        if (num > 0) result += " ";
    }

    if (num > 0 && num < 20) {
        result += BELOW_20[num];
    }

    return result;
}

export function numberToWords(num: number): string {
    if (!Number.isFinite(num)) {
        throw new Error("numberToWords requires a finite number");
    }

    if (num === 0) return "zero";
    if (num < 0) return "minus " + numberToWords(Math.abs(num));

    const BILLION = 1_000_000_000;
    const MILLION = 1_000_000;
    const THOUSAND = 1_000;

    let result = "";

    if (num >= BILLION) {
        result += convertHundreds(Math.floor(num / BILLION)) + " billion";
        num %= BILLION;
        if (num > 0) result += " ";
    }

    if (num >= MILLION) {
        result += convertHundreds(Math.floor(num / MILLION)) + " million";
        num %= MILLION;
        if (num > 0) result += " ";
    }

    if (num >= THOUSAND) {
        result += convertHundreds(Math.floor(num / THOUSAND)) + " thousand";
        num %= THOUSAND;
        if (num > 0) result += " ";
    }

    if (num > 0) {
        result += convertHundreds(num);
    }

    return result.trim();
}
