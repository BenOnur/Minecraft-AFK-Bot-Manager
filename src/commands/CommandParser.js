import logger from '../utils/Logger.js';

export class CommandParser {
    static parseSlots(slotString) {
        if (slotString === 'all') {
            return 'all';
        }

        const slots = new Set();

        // Virgülle ayrılmış veya tek slot
        const parts = slotString.split(',');

        for (const part of parts) {
            const trimmed = part.trim().replace(/[\[\]]/g, ''); // Köşeli parantezleri kaldır

            // Aralık kontrolü (1-3)
            if (trimmed.includes('-')) {
                const [start, end] = trimmed.split('-').map(n => parseInt(n.trim()));

                if (isNaN(start) || isNaN(end)) {
                    continue;
                }

                for (let i = start; i <= end; i++) {
                    slots.add(i);
                }
            } else {
                const slot = parseInt(trimmed);
                if (!isNaN(slot)) {
                    slots.add(slot);
                }
            }
        }

        return Array.from(slots).sort((a, b) => a - b);
    }

    static parseCommand(text) {
        const trimmed = text.trim();

        // Normal format: /command args
        const parts = trimmed.split(/\s+/);
        const command = parts[0].substring(1).toLowerCase(); // Remove /
        const args = parts.slice(1);

        return {
            command,
            args
        };
    }

    static validateSlots(slots, availableSlots) {
        if (slots === 'all') {
            return { valid: true, slots: availableSlots };
        }

        const invalidSlots = slots.filter(s => !availableSlots.includes(s));

        if (invalidSlots.length > 0) {
            return {
                valid: false,
                error: `Invalid slots: ${invalidSlots.join(', ')}`,
                validSlots: slots.filter(s => availableSlots.includes(s))
            };
        }

        return { valid: true, slots };
    }
}
