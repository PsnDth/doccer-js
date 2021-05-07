const { ArgumentType } = require('discord.js-commando');
const moment = require('moment');

module.exports = class DateArgumentType extends ArgumentType {
    constructor(client) {
        super(client, 'date');
    }

    static toDate(val) {
        return moment(val, [
            'YYYY/MMM/D', 'MMM/D/YYYY',
            'MMM Do', 'MMM D',
            'MMMM Do', 'MMMM D',
            'M/D',
        ], true);
    }

    static formatDate(date) {
        return moment(date).format('YYYY/MMM/D');
    }

    validate(val, msg, arg) {
        const date = DateArgumentType.toDate(val);
        if (!date.isValid()) return false;
        if(arg.oneOf && !arg.oneOf.includes(date)) {
            return `Please enter one of the following options: ${arg.oneOf.map(opt => `\`${DateArgumentType.formatDate(opt)}\``).join(', ')}`;
        }
        if(arg.min !== null && typeof arg.min !== 'undefined' && date.isBefore(arg.min)) {
            return `Please enter a number after or exactly ${DateArgumentType.formatDate(arg.min)}.`;
        }
        if(arg.max !== null && typeof arg.max !== 'undefined' && date.isAfter(arg.max)) {
            return `Please enter a date before or exactly ${DateArgumentType.formatDate(arg.max)}.`;
        }
        return true;
    }

    parse(val) {
        return DateArgumentType.toDate(val);
    }
};