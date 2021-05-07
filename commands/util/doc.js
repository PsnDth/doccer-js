const { MessageAttachment } = require('discord.js');
const { Command } = require('discord.js-commando');
const moment = require('moment');

/**
 * Apply function to all messages in message collector
 */
function applyAll(messageCollector, func, start = null) {
    const messageQuery = { limit: 100 };
    if (start) messageQuery.before = start;
    return messageCollector.fetch(messageQuery).then(messages => {
        let stop = false;
        messages.each(message => {
            if (!stop) stop = func(message);
        });
        if (!stop && messages.size) {
            return applyAll(messageCollector, func, start = messages.last().id);
        }
    });
}

class DocSection {
    constructor(ref, startDate, endDate) {
        this.ref = ref;
        this.startDate = startDate;
        this.endDate = endDate;
    }

    async toDoc() {
        throw 'unimplemented toDoc method';
    }

    emptyDoc() {
        return `Nothing interesting, but check the channel for [more discussions](https://discord.com/channels/${this.ref.guild.id}/${this.ref.id})`;
    }
}

class ChannelDoc extends DocSection {
    constructor(ref, startDate, endDate, in_category = false) {
        super(ref, startDate, endDate);
        this.in_cat = in_category;
    }

    async getImportantMessages() {
        const importantMessages = [];
        return applyAll(this.ref.messages, (msg) => {
            const inTimeRange = moment(msg.createdAt).isBetween(this.startDate, this.endDate || moment.now(), 'day', '[]');
            if (inTimeRange) {
                if (msg.pinned) {
                    importantMessages.push(msg);
                }
            }
            return !inTimeRange && !moment(msg.createdAt).isBefore(this.startDate);
        })
            .then(() => {return importantMessages;});
    }

    static fromMessage(msg) {
        return `* ${msg.cleanContent} ([source](${msg.url}))`;
    }

    async toDoc() {
        const title = this.ref.name;
        const messages = await this.getImportantMessages();
        if (!messages.length && this.in_cat) return Buffer.from('', 'utf8');

        return Buffer.concat([
            Buffer.from((this.in_cat ? '###' : '##') + title + '\n', 'utf8'),
            Buffer.from((messages.length ? messages.map(ChannelDoc.fromMessage).join('\n') : this.emptyDoc()) + '\n', 'utf8'),
            Buffer.from('\n', 'utf8'),
        ]);
    }
}

class CategoryDoc extends DocSection {
    constructor(ref, startDate, endDate) {
        super(ref, startDate, endDate);
    }

    async channelToDoc(channel) {
        return new ChannelDoc(channel, this.startDate, this.endDate, true).toDoc();
    }

    async toDoc() {
        const title = this.ref.name;
        const childrenDocs = [];
        for (const channel of this.ref.children.array()) {
            if (channel.isText()) childrenDocs.push(await this.channelToDoc(channel));
        }
        const combinedDoc = Buffer.concat(childrenDocs);
        return Buffer.concat([
            Buffer.from((this.in_cat ? '###' : '##') + title + '\n', 'utf8'),
            combinedDoc.length ? combinedDoc : Buffer.from(this.emptyDoc(), 'utf8'),
        ]);
    }
}

class Doc {
    constructor(client, startDate, endDate) {
        this.client = client;
        this.start = startDate;
        this.end = endDate;
        this.sections = [];
    }

    addCategorySection(category) {
        this.sections.push(new CategoryDoc(category, this.start, this.end));
    }

    addChannelSection(channel) {
        this.sections.push(new ChannelDoc(channel, this.start, this.end));
    }

    static formatDate(date, with_year = false) {
        return moment(date).format(`MMM Do${with_year ? ', YYYY' : ''}`);
    }

    renderDateRange() {
        const sameYear = moment(this.start).isSame(this.end, 'year');
        const endsCurrentYear = moment().isSame(this.end, 'year');
        const sinceBeginning = this.start.unix() == 0;
        let dateTitle = '';
        if (sinceBeginning) {
            dateTitle += 'Up until ';
        }
        else {
            dateTitle += `${Doc.formatDate(this.start, !sameYear)} - `;
        }
        // NOTE: Should never just have end date that's not current year
        dateTitle += Doc.formatDate(this.endDate, !(sameYear || (sinceBeginning && endsCurrentYear)));
        return dateTitle;
    }

    async toDoc() {
        const title = `Important Messages : ${this.renderDateRange()}`;
        const doc = Buffer.from(title + '\n' + '='.repeat(title.length) + '\n', 'utf8');
        const subsections = [doc];
        for (const section of this.sections) {
            subsections.push(await section.toDoc());
        }
        return Buffer.concat(subsections);
    }
}
module.exports = class DocCommand extends Command {
    constructor(client) {
        super(client, {
            name: 'doc',
            autoAliases: true,
            group: 'util',
            memberName: 'doc',
            description: 'Parse messages in provided date range and extracts important (pinned) ones',
            guildOnly: true,
            examples: [
                'doc 1/1',
                'doc "Jan 1st" "May 30th"',
                'doc 1/1 #channel1 #channel2',
                'doc 1/1 3/31 123123123123',
            ],
            clientPermissions: ['READ_MESSAGE_HISTORY', 'VIEW_CHANNEL', 'SEND_MESSAGES', 'ATTACH_FILES'],
            userPermissions: ['MANAGE_MESSAGES'],
            args: [
                {
                    key: 'startDateOrChannel',
                    label: 'start date or channel',
                    prompt: 'What is the beginning of the date range to parse messages for?',
                    type: 'date|text-channel|category-channel',
                    default: () => { return moment(0); },
                },
                {
                    key: 'endDateOrChannel',
                    label: 'end date or channel',
                    prompt: 'What is the ending of the date range to parse messages for?',
                    type: 'date|text-channel|category-channel',
                    default: () => { return moment.invalid(); },
                    // no validation of dates, if the dates are in the wrong order, just give empty output
                },
                {
                    key: 'channels',
                    label: 'channel',
                    prompt: 'What is the beginning of the date range to parse messages for?',
                    type: 'text-channel|category-channel',
                    default: () => { return []; },
                    infinite: true,
                },
            ],

        });
    }

    async run(message, { startDateOrChannel, endDateOrChannel, channels }) {
        const providedStartDate = moment.isMoment(startDateOrChannel);
        const providedEndDate = moment.isMoment(endDateOrChannel);
        const startDate = providedStartDate ? startDateOrChannel : moment(0);
        const endDate = providedEndDate && endDateOrChannel.isValid() ? endDateOrChannel : moment();
        if (!providedEndDate) channels.unshift(endDateOrChannel);
        if (!providedStartDate) channels.unshift(startDateOrChannel);
        if (!providedStartDate && providedEndDate && endDateOrChannel.isValid()) return message.reply('You provided an invalid channel.');

        const doc = new Doc(message.client, startDate, endDate);
        channels.forEach(channel => {
            if (channel.type == 'text') doc.addChannelSection(channel);
            else doc.addCategorySection(channel);
        });
        const docFile = await doc.toDoc();
        return message.reply('Here\'s the generated summary doc', new MessageAttachment(docFile, 'summary_doc.md'));
    }
};
