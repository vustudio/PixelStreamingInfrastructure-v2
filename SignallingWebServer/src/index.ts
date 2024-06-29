import express from 'express';
import fs from 'fs';
import path from 'path';
import { SignallingServer,
         IServerConfig,
         WebServer,
         InitLogging,
         Logger,
         IWebServerConfig } from '@epicgames-ps/lib-pixelstreamingsignalling-ue5.5';
import { stringify, beautify, IProgramOptions } from './Utils';
import { initInputHandler } from './InputHandler';
import { Command, Option } from 'commander';
import { initialize } from 'express-openapi';

// eslint-disable-next-line  @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
const pjson = require('../package.json');

const program = new Command();
program
    .name('node build/index.js')
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    .description(pjson.description)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    .version(pjson.version);

// For any switch that doesn't take an argument, like --serve, its important to give it the default
// of false. Without the default, not supplying the default will mean the option is undefined in
// cli_options. When merged with the config_file options, if the app was previously run with --serve
// you will not be able to turn serving off without editing the config file.
// an alternative could be to use --serve <enabled>, but then the options come through as strings
// as 'true' or 'false', which might not be terrible, but it's not as neat.
program
    .option('--log_folder <path>', 'Sets the path for the log files.', 'logs')
    .addOption(new Option('--log_level_console <level>', 'Sets the logging level for console messages.')
        .choices(["debug","info","warning","error"])
        .default("info"))
    .addOption(new Option('--log_level_file <level>', 'Sets the logging level for log files.')
        .choices(["debug","info","warning","error"])
        .default("info"))
    .addOption(new Option('--console_messages [detail]', 'Displays incoming and outgoing signalling messages on the console.')
        .choices(["basic","verbose","formatted"])
        .preset("basic"))
    .option('--streamer_port <port>', 'Sets the listening port for streamer connections.', '8888')
    .option('--player_port <port>', 'Sets the listening port for player connections.', '80')
    .option('--sfu_port <port>', 'Sets the listening port for SFU connections.', '8889')
    .option('--serve', 'Enables the webserver on player_port.', false)
    .option('--http_root <path>', 'Sets the path for the webserver root.', 'www')
    .option('--homepage <filename>', 'The default html file to serve on the web server.', 'player.html')
    .option('--https', 'Enables the webserver on https_port and enabling SSL', false)
    .addOption(new Option('--https_port <port>', 'Sets the listen port for the https server.')
        .implies({https: true})
        .default(443))
    .option('--ssl_key_path <path>', 'Sets the path for the SSL key file.','ssl/key.pem')
    .option('--ssl_cert_path <path>', 'Sets the path for the SSL certificate file.','ssl/cert.pem')
    .option('--https_redirect', 'Enables the redirection of connection attempts on http to https. If this is not set the webserver will only listen on https_port. Player websockets will still listen on player_port.', false)
    .option('--rest_api', 'Enables the rest API interface that can be accessed at <server_url>/api/api-definition', false)
    .addOption(new Option('--peer_options <json-string>', 'Additional JSON data to send in peerConnectionOptions of the config message.')
        .argParser(JSON.parse))
    .option('--matchmaker', 'Enable matchmaker connection.', false)
    .addOption(new Option('--matchmaker_address <address>', 'Sets the matchmaker address to connect to.')
        .default('127.0.0.1')
        .implies({ matchmaker: true }))
    .addOption(new Option('--matchmaker_port <port>', 'Sets the matchmaker port to connect to.')
        .default('9999')
        .argParser(parseInt))
    .addOption(new Option('--matchmaker_retry <seconds>', 'Sets the delay before reconnecting to the matchmaker after a disconnect.').default("5").argParser(parseInt))
    .addOption(new Option('--matchmaker_keepalive <seconds>', 'Sets the delay between matchmaker pings.')
        .default('30')
        .argParser(parseInt))
    .option('--public_ip <ip address>', 'The public IP address to be used to connect to this server. Only needed when using matchmaker.', '127.0.0.1')
    .option('--log_config', 'Will print the program configuration on startup.', false)
    .option('--stdin', 'Allows stdin input while running.', false)
    .option('--no_config', 'Skips the reading of the config file. Only CLI options will be used.', false)
    .option('--config_file <path>', 'Sets the path of the config file.', 'config.json')
    .option('--no_save', 'On startup the given configuration is resaved out to config.json. This switch will prevent this behaviour allowing the config.json file to remain untouched while running with new configurations.', false)
    .helpOption('-h, --help', 'Display this help text.')
    .allowUnknownOption() // ignore unknown options which will allow versions to be swapped out into existing scripts with maybe older/newer options
    .parse();

// parsed command line options
const cli_options: IProgramOptions = program.opts();

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */

// possible config file options
let config_file: any = {};
if (!cli_options.no_config) {
    // read any config file
    try {
        const configData = fs.readFileSync(cli_options.config_file, { encoding: 'utf8' });
        config_file = JSON.parse(configData);
    } catch(error) {
        // silently fail here since we havent started the logging system yet.
    }
}

// merge the configurations
const options: IProgramOptions = { ...config_file, ...cli_options };

// save out new configuration (unless disabled)
if (!options.no_save) {

    // dont save certain options
    const save_options = { ...options };
    delete save_options.no_config;
    delete save_options.config_file;
    delete save_options.no_save;

    // save out the config file with the current settings
    fs.writeFile(options.config_file, beautify(save_options), (error: any) => {
        if (error) throw error;
    });
}

InitLogging({
    logDir: options.log_folder,
    logMessagesToConsole: options.console_messages,
    logLevelConsole: options.log_level_console,
    logLevelFile: options.log_level_file,
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
Logger.info(`${pjson.name} v${pjson.version} starting...`);
if (options.log_config) {
    Logger.info(`Config: ${stringify(options)}`);
}

const app = express();

const serverOpts: IServerConfig = {
    streamerPort: options.streamer_port,
    playerPort: options.player_port,
    sfuPort: options.sfu_port,
    peerOptions: options.peer_options,
    useMatchmaker: options.matchmaker,
    matchmakerAddress: options.matchmaker_address,
    matchmakerPort: options.matchmaker_port,
    matchmakerRetryInterval: options.matchmaker_retry,
    matchmakerKeepAliveInterval: options.matchmaker_keepalive,
    publicIp: options.public_ip,
    publicPort: options.https ? options.https_port : options.player_port
}

if (options.serve) {
    const webserverOptions: IWebServerConfig = {
        httpPort: options.player_port,
        root: options.http_root,
        homepageFile: options.homepage
    };
    if (options.https) {
        webserverOptions.httpsPort = options.https_port;
        webserverOptions.ssl_key = fs.readFileSync(path.join(__dirname, '..', options.ssl_key_path));
        webserverOptions.ssl_cert = fs.readFileSync(path.join(__dirname, '..', options.ssl_cert_path));
        webserverOptions.https_redirect = options.https_redirect;
    }
    const webServer = new WebServer(app, webserverOptions);
    if (!options.https || webserverOptions.https_redirect) {
        serverOpts.httpServer = webServer.httpServer;
    }
    serverOpts.httpsServer = webServer.httpsServer;
}

const signallingServer = new SignallingServer(serverOpts);

if (options.stdin) {
    initInputHandler(options, signallingServer);
}

if (options.rest_api) {
    void initialize({
        app,
        docsPath: "/api-definition",
        exposeApiDocs: true,
        apiDoc: "./apidoc/api-definition-base.yml",
        paths: "./build/paths",
        dependencies: {
            signallingServer,
        }
    });
}
