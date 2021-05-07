const { CommandoClient } = require('discord.js-commando');
const config = require('./config.json');
const path = require('path');

const client = new CommandoClient({
    commandPrefix: config.prefix,
    owner: config.owner,
});

client.registry
    .registerDefaults()
    .registerTypesIn(path.join(__dirname, 'types'))
    .registerCommandsIn(path.join(__dirname, 'commands'));


client.on('error', console.error);

client.login(config.token);