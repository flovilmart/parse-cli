var constants = require("./constants"),
  config_handler = require("./configHandler");
  parse = require("./parse"),
  request = require("request-sync"),
  fs = require('fs'),
  prompt = require('prompt'),
  path = require('path'),
  util = require('util'),
  getopt = require('posix-getopt'),
  fse = require('fs-extra'),
  _ = require('underscore'),
  program = require('commander')


var _write = process.stdout.write;

var CLI = {};
process.stdout.write = function(){
  var args = Array.prototype.slice.call( arguments, 0 );
  args = _.map(args, function(arg){
    return arg ? arg.toString('utf8') : '';
  })
  _write.call(this, util.format.apply(util, args));  
}

var output_file = process.stdout;

function download_and_save(url, dest_file, output_file) {
  var response = request(url);
  fs.writeFileSync(dest_file, response.body);
}

function sorted_naturally(iterable, is_descending){
  return iterable;
}

function get_default_target(){
  return '_default';
}

function getParseVersion(parse_root){
  return config_handler.version(parse_root, false);
}

function set_parse_version(parse_root, parse_version){
  return config_handler.version(parse_root, parse_version);
}

function server(){
  return 'https://api.parse.com/';
}

function check_script_version(version, output_file){
  output_file = output_file || process.stdout;
  var url = server()+'1/supported?version='+version;
  var respone = request(url);
  response = JSON.parse(response.body);
  if (response.error) {
    output_file.write('FATAL: %s\n', response['error']);
    return false;
  }else if(response.warning){
    output_file.write('WARNING: %s\n' , response['warning'])
  }
  return true;
}

function select_apps(server, callback){

  base_api_get(server, '1/apps', function(err, response){
    if (err) {
      console.log("\nCancelled...\n");
      return;
    }
    var app_list = JSON.parse(response.body);
    var display = Object.keys(app_list);
    var i = 1;
    display.forEach(function(appName){
      console.log(i+": "+appName);
      i++;
    });
    prompt.start();
    prompt.get({
      properties: {
          'appindex': {
            description: 'Select an App:',
            message: 'Please select an app between 1-'+display.length,
            required: true,
            conform: function (value) {
              var v = parseInt(value);
              return (v > 0 && v<=display.length);
            }
          }
      }
    }, function(err, result){
      var select = parseInt(result['appindex']);
      callback(display[select-1], app_list[display[select-1]]);
    })
  });
}

function base_api_get (server, endpoint, callback){
  var schema = {
    properties: {
      email: {
        description: 'Email:',
        required: true
      },
      password: {
        description: 'Password:', 
        hidden: true,
        required: true
      }
    }
  };
  prompt.start();
  prompt.message = '';
  prompt.delimiter = '';
  prompt.get(schema, function (err, result) {
    if (err) {
      console.log("\nCancelled...\n");
      callback(err);
      return;
    }
    var headers = { "X-Parse-Email" : result.email,
                    "X-Parse-Password" : result.password };
    var response = request(server+endpoint, {headers: headers});
    callback(null, response);
  });
}


CLI.find_parse_root = find_parse_root = function(output_file){
  output_file = output_file || process.stdout;
  var cpath = process.cwd();
  var config_path = path.join(cpath, constants.CONFIG_DIR, constants.GLOBAL_FILE);
  if(!fs.existsSync(config_path)){
    output_file.write("You should be run in a directory containing a Parse project\n");
  }else{
    return cpath;
  }
}


CLI.parse_options = parse_options = function(args, short_ops){
  var parser = new getopt.BasicParser(short_ops, args);
  var options = {};
  var option;
  var rArgs = [];
  while ((option = parser.getopt()) !== undefined) {
    options[option.option] = option.optarg || true;  

  }
  return [options, args[parser.optind()]];
}

CLI.handle_cliversion = handle_cliversion= function(){
  output_file = output_file || process.stdout;
  output_file.write("parse-cli v%s\n", constants.VERSION)
}

CLI.handle_push = handle_push =function(appName, options){
  var output_file = output_file || process.stdout;

  var stage = get_default_target();
  if (appName) {
    stage = appName;
  };
  if (options && options.parse_root) {
    parse_root = options.parse_root;
  };
  var description = typeof options.description === 'string' ? options.description : '';
  var handler = new parse.StageHandler(stage, server(), parse_root, output_file);
  if(!handler.valid()){
    return false;
  }
  old_version = getParseVersion(parse_root);
  handler.deploy(description, old_version,false,undefined, function(data){
      if (!data) {
        return false;
      }
      if (data && data['parseVersion'] && old_version === data['parseVersion']) {
        return;
      };
      if (!getParseVersion(parse_root) && data && data['parseVersion']) {
        set_parse_version(data['parseVersion']);
      }
  });
  
}

CLI.handle_default = handle_default = function(new_app){
  var output_file = output_file || process.stdout;
  
  apps = config_handler.get_info_for_apps(parse_root);
  if (apps.length == 0)
  {
    output_file.write('No apps are associated with this project. You can add some with parse add\n')
    return
  }
  if( apps['_default'] )
  {
    default_app = apps['_default'][constants.LINK]
  }
  else{
    default_app = None
  }

  if (!new_app){
    if (!default_app){
      output_file.write('No app is set as default app\n')
    }
    else{
      output_file.write('Current default app is %s\n' , default_app)
    }
  } 
  else{
    config_handler.set_default_app(parse_root, new_app, output_file)
  }
}

CLI.handle_rollback = handle_rollback = function(){
  output_file = output_file || process.stdout;
  var stage = get_default_target();
  var opts = arguments[arguments.length - 1];
  if (arguments.length > 1) {
    stage = arguments[0];
  }

  release = opts.release;
  handler = new parse.StageHandler(stage, server(), parse_root, output_file)
  if (! handler.valid()){
    return false;
  }
  handler.rollback(release)
}

CLI.handle_list_apps = handle_list_apps = function(args, parse_root, output_file){
  output_file = output_file || process.stdout;
  var opts = arguments[arguments.length - 1];
  apps = config_handler.get_info_for_apps(parse_root);
  if(!apps.length)
  {
    output_file.write('No apps are associated with this project. You can add some with parse add\n')
    return
  }
  output_file.write('Associated apps are:\n')
  config_handler.print_list_of_apps(apps, output_file)
}

CLI.handle_new = handle_new = function(){
  output_file = output_file || process.stdout;
  var  directory = 'parse'
  var opts = arguments[arguments.length - 1];
  if (arguments.length > 1) {
    directory = arguments[0];
  }
  var dest_dir = path.join(process.cwd(), directory);
  var as = args.slice(2);
  if (as.length > 0) {
    dest_dir = path.join(process.cwd(), as[0]);
  }

  config_file = path.join(dest_dir, constants.CONFIG_DIR, constants.GLOBAL_FILE)
  config_dir = path.join(dest_dir, constants.CONFIG_DIR)
  if (fs.existsSync(config_file) || fs.existsSync(config_dir)) {
    output_file.write("A Parse project already exists in directory %s\n", dest_dir)
    return false;
  }else{
    var templates_path = path.join(__dirname, "../", constants.TEMPLATES);
    fse.copySync(templates_path, dest_dir);
    if( argv.length > 2) {
          directory = argv[2]
        } 
        var app_path = path.join(process.cwd(), directory)
        handle_add({}, app_path, true, function(err){
          if (err) {
            console.log(err);
          }
        });
  }
  return true;
}

CLI.handle_generate = handle_generate = function(){
  output_file = output_file || process.stdout;
}

CLI.handle_list = handle_list = function(){
  var opts = arguments[arguments.length - 1];
  apps = config_handler.get_info_for_apps(parse_root)
  if (apps.length == 0){
    process.stdout.write('No apps are associated with this project. You can add some with parse add\n')
  } 
  process.stdout.write('Associated apps are:\n')
  config_handler.print_list_of_apps(apps, output_file)
}

CLI.do_add = do_add = function(args, app_path, make_default, callback){
	var local = args.local;
	var alias_name = args.alias;
	select_apps(server(), function(name, keys){
	    if (!name) {
	      return;
	    };
	    var err = config_handler.add_app(app_path, name, keys, alias_name, !local, output_file);
	    if(!err && make_default){
	      err = config_handler.add_alias(app_path, name, '_default', !local,
	                                    process.stdout)
	    }
	    if (callback) {
	    	callback(err);
	    }
  	});
}

CLI.handle_add = handle_add = function(){
  var alias;
  var opts = arguments[arguments.length - 1];
  if (arguments.length > 1) {
    alias = arguments[0];
  };
  local = opts.l;

  do_add({}, parse_root, true, function(err){

  });
}

CLI.handle_tail = handle_tail = function(){
  var output_file = output_file || process.stdout;
  var iterations = iterations || undefined;
  var stage = get_default_target();
  var opts = arguments[arguments.length - 1];
  if (arguments.length > 1) {
    stage = arguments[0];
  }
  var n = opts.N;
  var f =  opts.F;
  var level = opts.level;
  var handler = new parse.StageHandler(stage, server(), parse_root, output_file)
  if(! handler.valid()){
    return false;
  }

  handler.tail(n, f, level, iterations)
}

CLI.handle_releases = handle_releases = function(args, parse_root, output_file){
  output_file = output_file || process.stdout;
}

CLI.handle_update = handle_update = function(args, output_file){
  output_file = output_file || process.stdout;
}

CLI.handle_run = handle_run = function(appName, options){
    var Server = require("parse-develop/lib/ParseServer");
    var s;
    if (options && options.parse_root) {
      s = new Server(appName, options.parse_root);
    }else{
      s = new Server(appName);
    }
    
    s.start();
}

CLI.handle_develop = handle_develop = function(appName, options){
  output_file = output_file || process.stdout;
  var time_between_deploys;// = time_between_deploys || undefined;
  var num_iterations;// = num_iterations || undefined;
  
  if (typeof appName !== 'string'){
      output_file.write("An app must be provided to develop\n")
      return 1
  }
  if (options.parse_root) {
    parse_root = options.parse_root;
  };
  var always_get_version_from_server// = always_get_version_from_server || false;
  stage = arguments[0]
  handler = new parse.StageHandler(stage, server(), parse_root, output_file);
  if (!handler.valid()) {
    return;
  };
  handler.develop(function(){
    return getParseVersion(parse_root);
  }, function(version){
    return set_parse_version(parse_root, version);
  }, time_between_deploys, num_iterations, always_get_version_from_server)

}

CLI.get_all_versions = get_all_versions = function(){
  parse_root = parse_root || find_parse_root();
  output_file = output_file || process.stdout;
  var target = get_default_target()
  var keys = config_handler.get_keys_for_app(parse_root, target)
  client = new parse.ParseHTTPClient(server(), keys[constants.APPLICATION_ID], keys[constants.MASTER_KEY]);
  return client.get('1/cli/versions').body;
}

CLI.get_all_js_sdks = get_all_js_sdks = function(parse_root, output_file){
  output_file = output_file || process.stdout;
}

CLI.handle_jssdk =  handle_jssdk = function(args, parse_root, output_file){
  output_file = output_file || process.stdout;
}

module.exports = CLI;
