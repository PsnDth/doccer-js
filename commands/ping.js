module.exports = {
    name: 'ping',
    description: 'Test whether the bot is available or not',
    // eslint-disable-next-line no-unused-vars
    execute(message, args) {
        message.reply('Pong.');
    },
};