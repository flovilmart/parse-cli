var constants = require("./constants.json"), config_handler = require("./configHandler");

parse = require("./parse.js"), request = require("request-sync"), fs = require("fs"), 
prompt = require("prompt"), path = require("path"), util = require("util"), getopt = require("posix-getopt");

var _write = process.stdout.write;

process.stdout.write = function() {
    _write.call(this, util.format.apply(util, arguments));
};

function download_and_save(url, dest_file, output_file) {
    var response = request(url);
    fs.writeFileSync(dest_file, response.body);
}

function sorted_naturally(iterable, is_descending) {
    return iterable;
}

function get_default_target() {
    return "_default";
}

function get_parse_version(parse_root) {
    return config_handler.version(parse_root, false);
}

function set_parse_version(parse_root, parse_version) {
    return config_handler.version(parse_root, parse_version);
}

function server() {
    return "https://api.parse.com/";
}

function check_script_version(version, output_file) {
    output_file = output_file || process.stdout;
    var url = server() + "1/supported?version=" + version;
    var respone = request(url);
    response = JSON.parse(response.body);
    if (response.error) {
        output_file.write("FATAL: %s\n", response["error"]);
        return false;
    } else if (response.warning) {
        output_file.write("WARNING: %s\n", response["warning"]);
    }
    return true;
}

function select_apps(server, callback) {
    var schema = {
        properties: {
            email: {
                description: "Email: ",
                required: true
            },
            password: {
                description: "Password: ",
                hidden: true,
                required: true
            }
        }
    };
    prompt.start();
    prompt.get(schema, function(err, result) {
        if (err) {
            console.log("\nCancelled...\n");
            return;
        }
        var headers = {
            "X-Parse-Email": result.email,
            "X-Parse-Password": result.password
        };
        var response = request(server + "1/apps", {
            headers: headers
        });
        var app_list = JSON.parse(response.body);
        var display = Object.keys(app_list);
        var i = 1;
        display.forEach(function(appName) {
            console.log(i + ": " + appName);
            i++;
        });
        prompt.start();
        prompt.get({
            properties: {
                appindex: {
                    description: "Select an App: ",
                    required: true
                }
            }
        }, function(err, result) {
            var select = parseInt(result["appindex"]);
            callback(display[select - 1], app_list[display[select - 1]]);
        });
    });
}

function find_parse_root(output_file) {
    output_file = output_file || process.stdout;
    var cpath = process.cwd();
    var config_path = path.join(cpath, constants.CONFIG_DIR, constants.GLOBAL_FILE);
    if (!fs.existsSync(config_path)) {
        output_file.write("You should be run in a directory containing a Parse project\n");
    } else {
        return cpath;
    }
}

function maybe_get_option(opts, flag1, flag2) {
    if (flag1 && opts[flag1]) {
        return opts[flag1];
    } else if (flag2 && opts[flag2]) {
        return opts[flag2];
    } else {
        return;
    }
}

function parse_options(args, short_ops) {
    var parser = new getopt.BasicParser(short_ops, args);
    var options = {};
    var option;
    var rArgs = [];
    while ((option = parser.getopt()) !== undefined) {
        options[option.option] = option.optarg || true;
    }
    return [ options, args[parser.optind()] ];
}

function handle_cliversion(args, output_file) {
    output_file = output_file || process.stdout;
    output_file.write("%s\n", constants.VERSION);
}

function handle_deploy(args, parse_root, output_file) {
    output_file = output_file || process.stdout;
    var opts = parse_options(args, "d:(description)");
    var args = opts[1];
    var opts = opts[0];
    if (!args) {
        stage = get_default_target();
    } else {
        stage = args;
    }
    var description = maybe_get_option(opts, "d");
    var handler = new parse.StageHandler(stage, server(), parse_root, output_file);
    if (!handler.valid()) {
        return false;
    }
    old_version = get_parse_version(parse_root);
    handler.deploy(description, old_version, false, undefined, function(data) {
        if (!data) {
            return false;
        }
        if (data && data["parseVersion"] && old_version === data["parseVersion"]) {
            return;
        }
        if (!get_parse_version(parse_root) && data && data["parseVersion"]) {
            set_parse_version(data["parseVersion"]);
        }
    });
}

function handle_default(args, parse_root, output_file) {
    output_file = output_file || process.stdout;
    var opts = parse_options(args, "");
    var args = opts[1];
    var new_app;
    if (args) {
        new_app = args;
    }
    apps = config_handler.get_info_for_apps(parse_root);
    if (len(apps) == 0) {
        output_file.write("No apps are associated with this project. You can add some with parse add\n");
        return;
    }
    if (apps["_default"]) {
        default_app = apps["_default"][constants.LINK];
    } else {
        default_app = None;
    }
    if (!new_app) {
        if (!default_app) {
            output_file.write("No app is set as default app\n");
        } else {
            output_file.write("Current default app is %s\n", default_app);
        }
    } else {
        config_handler.set_default_app(parse_root, new_app, output_file);
    }
}

function handle_rollback(args, parse_root, output_file) {
    output_file = output_file || process.stdout;
    var opts = parse_options(args, "r:(release)");
    var args = opts[1];
    var opts = opts[0];
    if (!args) {
        stage = get_default_target();
    } else {
        stage = args[0];
    }
    release = maybe_get_option(opts, "r");
    handler = new parse.StageHandler(stage, server(), parse_root, output_file);
    if (!handler.valid()) {
        return false;
    }
    handler.rollback(release);
}

function handle_list_apps(args, parse_root, output_file) {
    output_file = output_file || process.stdout;
    apps = config_handler.get_info_for_apps(parse_root);
    if (!apps.length) {
        output_file.write("No apps are associated with this project. You can add some with parse add\n");
        return;
    }
    output_file.write("Associated apps are:\n");
    config_handler.print_list_of_apps(apps, output_file);
}

sample_source = '\n// Use Parse.Cloud.define to define as many cloud functions as you want.\n// For example:\nParse.Cloud.define("hello", function(request, response) {\n  response.success("Hello world!");\n});\n';

sample_html = '\n<html>\n  <head>\n    <title>My ParseApp site</title>\n    <style>\n    body { font-family: Helvetica, Arial, sans-serif; }\n    div { width: 800px; height: 400px; margin: 40px auto; padding: 20px; border: 2px solid #5298fc; }\n    h1 { font-size: 30px; margin: 0; }\n    p { margin: 40px 0; }\n    em { font-family: monospace; }\n    a { color: #5298fc; text-decoration: none; }\n    </style>\n  </head>\n  <body>\n    <div>\n      <h1>Congratulations! You\'re already hosting with Parse.</h1>\n      <p>To get started, edit this file at <em>public/index.html</em> and start adding static content.</p>\n      <p>If you want something a bit more dynamic, delete this file and check out <a href="https://parse.com/docs/hosting_guide#webapp">our hosting docs</a>.</p>\n    </div>\n  </body>\n</html>\n';

sample_app_js = "\n// These two lines are required to initialize Express in Cloud Code.\nvar express = require('express');\nvar app = express();\n\n// Global app configuration section\napp.set('views', 'cloud/views');  // Specify the folder to find templates\napp.set('view engine', 'ejs');    // Set the template engine\napp.use(express.bodyParser());    // Middleware for reading request body\n\n// This is an example of hooking up a request handler with a specific request\n// path and HTTP verb using the Express routing API.\napp.get('/hello', function(req, res) {\n  res.render('hello', { message: 'Congrats, you just set up your app!' });\n});\n\n// // Example reading from the request query string of an HTTP get request.\n// app.get('/test', function(req, res) {\n//   // GET http://example.parseapp.com/test?message=hello\n//   res.send(req.query.message);\n// });\n\n// // Example reading from the request body of an HTTP post request.\n// app.post('/test', function(req, res) {\n//   // POST http://example.parseapp.com/test (with request body \"message=hello\")\n//   res.send(req.body.message);\n// });\n\n// Attach the Express app to Cloud Code.\napp.listen();\n";

hello_ejs = "\n<!DOCTYPE html>\n<html>\n  <head>\n    <title>Sample App</title>\n  </head>\n  <body>\n    <h1>Hello World</h1>\n    <p><%= message %></p>\n  </body>\n</html>\n";

hello_jade = "\ndoctype 5\nhtml\n  head\n    title Sample App\n  body\n    h1 Hello World\n    p= message\n";

function handle_new(args, output_file) {
    output_file = output_file || process.stdout;
    var dest_dir = path.join(process.cwd(), "parse");
    var as = args.slice(2);
    if (as.length > 0) {
        dest_dir = path.join(process.cwd(), as[0]);
    }
    config_file = path.join(dest_dir, constants.CONFIG_DIR, constants.GLOBAL_FILE);
    config_dir = path.join(dest_dir, constants.CONFIG_DIR);
    if (fs.existsSync(config_file) || fs.existsSync(config_dir)) {
        output_file.write("A Parse project already exists in directory %s\n", dest_dir);
        return false;
    }
    if (!fs.existsSync(dest_dir)) {
        output_file.write(dest_dir);
        output_file.write("Creating a new project in directory " + dest_dir + "\n");
        fs.mkdir(dest_dir);
    } else if (fs.statSync(dest_dir).isFile()) {
        output_file.write("The specified project directory path %s already exists as a file, please use another path\n", dest_dir);
        return False;
    }
    output_file.write("Creating directory %s\n", config_dir);
    fs.mkdir(config_dir);
    var global_file_name = path.join(config_dir, constants.GLOBAL_FILE);
    fs.writeFileSync(global_file_name, "{}");
    output_file.write("Creating config file %s\n", global_file_name);
    var cloud_src = path.join(dest_dir, "cloud");
    if (!fs.existsSync(cloud_src)) {
        output_file.write("Creating directory %s\n", cloud_src);
        fs.mkdir(cloud_src);
    }
    var main_js = path.join(cloud_src, "main.js");
    if (!fs.existsSync(main_js)) {
        output_file.write("Writing out sample file %s\n", main_js);
        fs.writeFileSync(main_js, sample_source);
    }
    var public_src = path.join(dest_dir, "public");
    if (!fs.existsSync(public_src)) {
        output_file.write("Creating directory %s\n", public_src);
        fs.mkdir(public_src);
    }
    var index_html = path.join(public_src, "index.html");
    if (!fs.existsSync(index_html)) {
        output_file.write("Writing out sample file %s\n", index_html);
        fs.writeFileSync(index_html, sample_html);
    }
    return true;
}

function handle_generate(args, parse_root, output_file) {
    output_file = output_file || process.stdout;
}

function handle_add(args, parse_root, make_default, callback) {
    select_apps(server(), function(name, keys) {
        if (!name) {
            return;
        }
        var alias_name;
        var err = config_handler.add_app(parse_root, name, keys, alias_name, !local, process.stdout);
        if (!err && make_default) {
            err = config_handler.add_alias(parse_root, name, "_default", !local, process.stdout);
        }
        callback(err);
    });
}

function handle_tail(args, parse_root, output_file, iterations) {
    output_file = output_file || process.stdout;
    iterations = iterations || undefined;
    stage = get_default_target();
    var opts = parse_options(args, "n:fl:(level)");
    var args = opts[1];
    var opts = opts[0];
    if (args) {
        stage = args;
    }
    n = opts.n;
    f = opts.f;
    level = opts.l;
    handler = new parse.StageHandler(stage, server(), parse_root, output_file);
    if (!handler.valid()) {
        return false;
    }
    handler.tail(n, f, level, iterations);
}

function handle_releases(args, parse_root, output_file) {
    output_file = output_file || process.stdout;
}

function handle_update(args, output_file) {
    output_file = output_file || process.stdout;
}

function handle_develop(args, parse_root, output_file, time_between_deploys, num_iterations, always_get_version_from_server) {
    output_file = output_file || process.stdout;
    time_between_deploys = time_between_deploys || undefined;
    num_iterations = num_iterations || undefined;
    always_get_version_from_server = always_get_version_from_server || false;
    stage = get_default_target();
    var opts = parse_options(args, "");
    if (!opts[1]) {
        return;
    }
    stage = opts[1];
    handler = new parse.StageHandler(stage, server(), parse_root, output_file);
    if (!handler.valid()) {
        return;
    }
    handler.develop(function() {
        return get_parse_version(parse_root);
    }, function(version) {
        return set_parse_version(parse_root, version);
    }, time_between_deploys, num_iterations, always_get_version_from_server);
}

function get_all_versions(parse_root, output_file) {
    output_file = output_file || process.stdout;
}

function get_all_js_sdks(parse_root, output_file) {
    output_file = output_file || process.stdout;
}

function handle_jssdk(args, parse_root, output_file) {
    output_file = output_file || process.stdout;
}

USAGE = {
    help: " [command],\n    Prints out usage text for a given command, or all commands if none was,\n    specified.,\n  ",
    add: " [app],\n    Adds a new Parse App through an interactive interface.  If an argument is,\n    given, the added application can also be referenced by that name.,\n    -l,--local   Stores the new application in the local config file rather,\n                 than the global one.,\n  ",
    "default": " [app],\n    Gets the default Parse App. If an argument is given, sets the default Parse App.,\n  ",
    cliversion: ",\n    Gets CLI tools version.,\n  ",
    deploy: " [app],\n    Deploys the current code to the given app.,\n    -d, --description   Add an optional description to the deploy.,\n  ",
    develop: " app,\n    Monitors for changes to source files and uploads updated files to Parse.,\n    This will also monitor the parse INFO log for any new log messages and write,\n    out updates to the terminal.  This requires an app to be provided, to,\n    avoid running develop on production apps accidently.,\n  ",
    rollback: " [app],\n    Rolls back the for the given app.,\n    -r, --release   Provides an optional release to rollback to.  If no release,\n                    is provided, rolls back to the previous release.,\n  ",
    log: ' [app],\n    Prints out recent log messages.\n    -n              The number of the messages to display.  Defaults to 10.,\n    -f              Emulates tail -f and streams new messages from the server,\n    -l, --level     The log level to restrict to.  Can be "INFO" or "ERROR".,\n                    Defaults to "INFO".,\n  ',
    releases: " [app],\n    Prints the releases the server knows about.,\n  ",
    update: ",\n    Updates this tool to the latest version. ,\n  ",
    "new": ',\n    Creates a Parse project in the current directory.  An optional argument can,\n    be given to specify the directory to create.  Otherwise, the "parse",\n    directory is created.,\n  ',
    "generate express [option]": ",\n    Generates a sample Express app in the current project directory.,\n    -j --jade       Use Jade templates (EJS templates is the default).,\n  ",
    list: ",\n    Prints the list of apps and aliases associated with this project.,\n  ",
    jssdk: " [version],\n    Sets the Parse JavaScript SDK version to use in Cloud Code.,\n    Prints the version number currently set if none is specified.,\n    -a, --all       Shows all available JavaScript SDK version.,\n  "
};

function usage() {
    console.log("Parse Command Line Interface\nVersion %s\nCopyright %d Parse, Inc.\nhttp://parse.com\n\nUsage: parse <command>\n       (Arguments in <> are required.  Those in [] are optional.)\n\n  Possible commands are:\n  ", constants.VERSION, 2014);
    for (var i in Object.keys(USAGE)) {
        var command = Object.keys(USAGE)[i];
        console.log("  %s%s", command, USAGE[command]);
    }
}

function handle_help(args) {
    if (args.length == 0 || Object.keys(USAGE).indexOf(args[0]) < 0) {
        usage();
    } else {
        console.log("  %s%s", args[0], USAGE[args[0]]);
    }
}

(function(argv) {
    var parse_root;
    if (argv.length < 2) {
        console.log("No command specified\n");
        usage();
        return 0;
    }
    var operation = argv[1];
    if ([ "cliversion", "help", "new", "update" ].indexOf(operation) < 0) {
        parse_root = find_parse_root();
        if (!parse_root) {
            return 1;
        }
    }
    if (![ "cliversion", "help", "new", "update" ].indexOf(operation) < 0 && !check_script_version(constants.VERSION)) {
        return 1;
    }
    switch (operation) {
      case "cliversion":
        handle_cliversion(argv.slice());
        break;

      case "deploy":
        handle_deploy(argv, parse_root);
        break;

      case "default":
        handle_default(argv, parse_root);
        break;

      case "rollback":
        handle_rollback(argv, parse_root);
        break;

      case "log":
        handle_tail(argv, parse_root);
        break;

      case "add":
        handle_add(argv, parse_root, false);
        break;

      case "releases":
        handle_releases(argv, parse_root);
        break;

      case "develop":
        if (argv.length <= 2) {
            console.log("An app must be provided to develop");
            handle_help([ "develop" ]);
            return 1;
        }
        handle_develop(argv, parse_root);
        break;

      case "new":
        if (handle_new(argv)) {
            directory = "parse";
            if (argv.length > 2) {
                directory = argv[2];
            }
            path = path.join(process.cwd(), directory);
        }
        handle_add([], path, true, function(err) {
            if (err) {
                // If we fail to add a project, then we should delete the config directory.
                // We can't delete the src tree, since that could have already been there.
                //shutil.rmtree(os.path.join(path, constants.CONFIG_DIR))
                //retval = False
                console.log(err);
            }
        });
        break;

      case "generate":
        handle_generate(argv, parse_root);
        break;

      case "list":
        handle_list(argv, parse_root);
        break;

      case "jssdk":
        handle_jssdk(argv, parse_root);
        break;

      case "help":
        handle_help(argv);
        break;

      default:
        console.log("Unknown command %s", operation);
        usage();
        break;
    }
})(process.argv.slice(1));