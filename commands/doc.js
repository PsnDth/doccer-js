const { MessageAttachment } = require('discord.js');
const moment = require('moment');

function asDate(str) {
    return moment(str, [
        'YYYY/MMM/D', 'MMM/D/YYYY',
        'MMM Do', 'MMM D',
        'MMMM Do', 'MMMM D',
        'M/D',
    ], true);
}

function asChannel(str, client) {
    const channelid = str.match(/^<#!?(\d+)>$/);
    if (!channelid) return;
    return client.channels.cache.get(channelid[1] || channelid[2]);
}

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

    async toDoc() {
        const sameYear = moment(this.start).isSame(this.end, 'year');
        const title = `Important Messages : ${Doc.formatDate(this.start, !sameYear)} - ${Doc.formatDate(this.end, !sameYear)}`;
        const doc = Buffer.from(title + '\n' + '='.repeat(title.length) + '\n', 'utf8');
        const subsections = [doc];
        for (const section of this.sections) {
            subsections.push(await section.toDoc());
        }
        return Buffer.concat(subsections);
    }
}

module.exports = {
    name: 'doc',
    description: 'Parse messages up until provided date and summarize them',
    execute(message, args) {
        const client = message.client;
        if (!args.length) {
            message.reply(
                'Not enough arguments provided ... \n' +
                'The correct format would be: doc <start_date> [<end_date>] [... <channel/category>]',
            );
            return;
        }
        const startDate = asDate(args.shift());
        const endDate = asDate(args[0]).isValid() ? asDate(args.shift()) : moment();
        if (!startDate.isValid()) {
            message.reply('Incorrect date format for `start_date`. Try using MMM/D/YYYY, i.e. \'Jan/18/2021\'');
            return;
        }
        const doc = new Doc(client, startDate, endDate);
        for (const arg of args) {
            const channel = asChannel(arg, client);
            if (!(channel && channel.guild === message.guild)) {
                message.reply(`got invalid channel/category ID: ${arg} \`(raw: ${arg})\``);
                return;
            }
            if (!channel.viewable) {
                message.reply(`can't access channel/category: ${arg}. Please update permissions accordingly`);
                return;
            }
            if (channel.type == 'category') {
                doc.addCategorySection(channel);
            }
            else if (channel.type == 'text') {
                doc.addChannelSection(channel);
            }
            else {
                message.reply(`got channel that is neither a text channel nor category but actually ${channel.type}: ${arg} \`(raw: ${arg})\`.`);
                return;
            }
        }
        doc.toDoc()
            .then(docFile => message.reply('Here\'s the generated summary doc', new MessageAttachment(docFile, 'summary_doc.md')))
            .catch(console.error);
    },
};