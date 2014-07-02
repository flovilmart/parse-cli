var request = require('request-sync'),
	querystring = require('querystring'),
	S = require('string'),
	glob = require('glob'),
	util = require('util'),
	path = require('path'),
	fs = require('fs'),
	async = require('async'),
	crypto = require('crypto'),
	mime = require('mime'),
	config_handler = require('./configHandler'),
	constants = require("./constants")

S.extendPrototype();
/*var _write = process.stdout.write;

process.stdout.write = function(){
  _write.call(this, util.format.apply(util, arguments));
}*/


var ParseHTTPClient = function(server, app_id, app_key){
	this._server = server;
	this._app_key = app_key;
	this._app_id = app_id;
}

ParseHTTPClient.prototype.post = function(url, data, content_type, content_encoding, encode_json){
	var self = this;
	content_type = content_type || 'application/json';
	content_encoding = content_encoding || undefined;
	encode_json = encode_json || true;
	if (encode_json && (content_type == 'application/json')) {
		data_bytes = new Buffer(JSON.stringify(data));
	}else{
		data_bytes = data;
	}

	var headers = { "X-Parse-Application-Id" : self._app_id,
                "X-PARSE-MASTER-KEY" : self._app_key,
                "content-type" : content_type }


    if (content_encoding) {
    	headers["Content-Encoding"] = content_encoding;
    }
    response = request(
    	{uri: self._server + url, "headers": headers, 
    	method: 'POST', 
    	body: data_bytes});
    try{
    	response.body = JSON.parse(response.body);
    }catch(e){
    	response.body = {};
    }
    return response;
}

ParseHTTPClient.prototype.get = function(url, args){
	var self = this;
	headers = { "X-Parse-Application-Id" : self._app_id,
                "X-PARSE-MASTER-KEY" : self._app_key }

    extra = '';
    if (args) {
    	extra = '?'+querystring.stringify(args);
    }
    var response = request(self._server+url+extra, {headers: headers});
    try{
    	response.body = JSON.parse(response.body);
    }catch(e){
    	response.body = {};
    }
    return response;
}


var StageHandler = function(name, server, parse_root, output_file){
	var self = this;
	self._name = name
    self._server = server
    self._parse_root = parse_root
    self._output_file = output_file
    self._valid = false
    self.load_state()
}

StageHandler.prototype.valid = function(){
	return this._valid;
}

StageHandler.prototype.load_state = function(){
	var self = this;
	var keys = config_handler.get_keys_for_app(self._parse_root, self._name)
    if(! keys){
   		self._output_file.write('Unknown application %s\n', self._name)
   		return;
    }
    self._http_client = new ParseHTTPClient(self._server, keys[constants.APPLICATION_ID], keys[constants.MASTER_KEY])
    self._valid = true
}

StageHandler.prototype.is_ignored_filename = function(filename){
	return filename.endsWith(".swp") || filename.endsWith("~") || filename.startsWith("#");
}

StageHandler.prototype.get_slashed_filename = function(filename){
	if (path.sep === "/") {
		return filename;
	}else{
		return filename.replace(path.sep, "/");
	}
}

StageHandler.prototype.get_source_files = function(dir, suffixes){
	var self = this;
	var list_of_dirs = [path.join(self._parse_root, dir)];
	var list_of_files = [];
	while (list_of_dirs.length > 0){
		new_dirs = [];
		list_of_dirs.forEach(function(d){
			files = glob.sync(path.join(d, '*'));
			files.forEach(function(f){
				if (fs.statSync(f).isDirectory()) {
					new_dirs.push(f);
				}else if(!self.is_ignored_filename(f) && (!suffixes || suffixes.indexOf(f.slice(f.indexOf("."+1))) < 0 )){
					list_of_files.push(f);
				}
			})
		});
		list_of_dirs = new_dirs;
	}
	return list_of_files;
}

StageHandler.prototype.compute_checksums = function(files, callback){
	if (files.length == 0) {
		return callback({});
	}
	var parallelism = 4;
	var checksums = {};
	var queue = async.queue(function(task, callback){
		var filename = task.filename;
		var algo = 'md5';
		var shasum = crypto.createHash(algo);
		var s = fs.ReadStream(filename);
		s.on('data', function(d) { shasum.update(d); });
		s.on('end', function() {
		    var d = shasum.digest('hex');
		    checksums[filename] = d;
		    callback();
		});
	}, parallelism);
	queue.drain = function(){
		callback(checksums);
	}
	files.forEach(function(filename, i){
		queue.push({filename: filename});
	});

	//return file_lists;
}

StageHandler.prototype.upload_source_files = function(dir, suffixes, endpoint, old_checksums, old_versions, print_if_changes, callback){
	var self = this;
	var old_checksums = old_checksums || {};
	var old_versions = old_versions || {};
	var source_files = self.get_source_files(dir, suffixes)
	var clean_checksums = {}
    var root_dir = path.join(self._parse_root, dir)
    var versions = {}
    var changes_found = false
    self.compute_checksums(source_files, function(checksums){
    	for(var i in source_files){
    		var source_file = source_files[i];
	    	var filename = self.get_slashed_filename(source_file.replace(root_dir, '').slice(1));
	    	clean_checksums[filename] = checksums[source_file];
	    	if (old_checksums[filename] && old_checksums[filename] == checksums[source_file] && old_versions[filename]) {
	    		versions[filename] = old_versions[filename];
	    		//continue;
	    	}else{
	    		var source = fs.readFileSync(source_file, {encoding: 'utf8'});
		      	var file_type = mime.lookup(source_file) || 'application/octet-stream';
		      	if (file_type.indexOf("html") >= 0) {
		      		file_type = 'application/octet-stream';
		      	};
		      	if (!changes_found && print_if_changes) {
		      		self._output_file.write('Deploying recent changes...\n')
		      	};
		      	changes_found = true;
		      	var response = self._http_client.post(endpoint+'/'+encodeURIComponent(filename), source, file_type, 'utf8', false);
		      	var err;
		      	if (!response) {
		      		self._output_file.write('Error talking to the Parse servers, try again\n')
		   			source_files = [];
		   			callback('error');
		   			return;
		      	};
		      	response = response.body;
	      		if(!response['version']){
		      		err = response;	
		      	}
		      	if (response.error) {
		      		err = response.error;
		      	}
		      	if (err) {
		      		self._output_file.write('Malformed response %s when trying to upload %s\n'
		                                , JSON.stringify(response), filename);
		      		return callback(err);
		      	}else if(!response['version']){
		      		self._output_file.write('Malformed response %s when trying to upload %s\n'
		                                , JSON.stringify(response), filename);
		      	}
		      	versions[filename] = response['version']
	    	}
	     } 	
	    //})
		callback(null, [versions, clean_checksums, changes_found]);
    });
}

StageHandler.prototype.rollback = function(release){
	var self = this;
	release = release || undefined;
	var message = release;
	if (!message) {
		message = 'previous version';
	};
	self._output_file.write("Rolling back to %s\n", message)
    message = self._http_client.post('1/deploy', { 'releaseName' : release })
    try{
    	message = JSON.parse(message);
    }catch(e){
    	self._output_file.write('Error talking to the Parse servers, try again\n')
    	return;
    }
    if (message.error){
      self._output_file.write('Rollback failed with %s\n' , message['error'])
    }
    else{
      self._output_file.write('Rolled back to version %s\n' , message['releaseName'])
    }
}

StageHandler.prototype.deploy = function(description, parse_version, for_develop, old_release, callback){
	var self = this;
	if (!for_develop) {
		self._output_file.write('Uploading source files\n')
	};

	var old_hosted_checksums, old_hosted_versions, old_script_versions, old_script_checksums;
	try{
		if (!old_release) {
			old_release = self._http_client.get('1/deploy', {})
			try{
				old_release = old_release.body;
				if (old_release.error) {
					self._output_file.write('Unable to authenticate app. Please make sure your applicationId and masterKey in "config/global.json" is correct\n')
	            	return;
				}else{
					old_parse_version = old_release['parseVersion']
				}
			}catch(e){
				old_release = {}
	        	old_parse_version = ''
			}
		}else{
			old_parse_version = old_release['parseVersion']
		}
		if ( old_release['checksums']['cloud'] || old_release['checksums']['public']){
			old_script_checksums = old_release['checksums']['cloud'] || {};
        	old_hosted_checksums = old_release['checksums']['public']  || {};
		}else{
			old_script_checksums = old_release['checksums']
        	old_hosted_checksums = {}
		}
      	if (old_release['userFiles']['cloud'] || old_release['userFiles']['public']){
      		old_script_versions = old_release['userFiles']['cloud'] || {};
   	        old_hosted_versions = old_release['userFiles']['public'] || {};
      	}else{
      		old_script_versions = old_release['userFiles']
        	old_hosted_versions = {}
      	}
	}catch(e){
		self._output_file.write('Failed to get old release information\n')
      	old_checksums = {}
      	old_versions = {}
	}

	var found_changes = false;

	async.series([
		function(cb){
			self.upload_source_files('cloud', ['js', 'ejs', 'jade'], '1/scripts', old_script_checksums, old_script_versions, for_develop, function(err, res){
				found_changes = res[2];
				cb(err, res);
			});
		}, function(cb){
			self.upload_source_files('public', false, '1/hosted_files', old_hosted_checksums, old_hosted_versions, ! found_changes && for_develop, function(err, res){
				cb(err, res);
			})
		}],
		function(err, results){
			if (err) {
				return callback();
			};
			var script_uploads=results[0],
			 hosted_uploads=results[1];
			var script_version_map = script_uploads[0], 
		  		script_checksums = script_uploads[1], 
		  		found_changes = script_uploads[2];
			var hosted_version_map = hosted_uploads[0], 
		  		hosted_checksums = hosted_uploads[1], 
		  		found_changes = hosted_uploads[2];

		  		if (script_version_map == null || !hosted_version_map ==null) {
		  			self._output_file.write('Failed to upload files\n')
		      		return callback()
		  		}else if(!script_version_map || !hosted_version_map){
		  			self._output_file.write('No files to upload\n')
		      		return callback();
		  		}
		  	var has_diff = false;
		  	if (script_version_map.length === old_script_versions.length &&
		  		hosted_version_map.length === old_hosted_versions.length &&
		  		(parse_version == old_parse_version)) {
		  		has_diff = false;
		  		Object.keys(script_version_map).forEach(function(filename){
		  			has_diff = has_diff || (!old_script_versions[filename] || script_version_map[filename] != old_script_versions[filename])
		  		});
		  		Object.keys(hosted_version_map).forEach(function(filename){
		  			has_diff = has_diff || (!old_hosted_versions[filename] || hosted_version_map[filename] != old_hosted_versions[filename])
		  		});
		  		if (!has_diff) {
		  			if (!for_develop) {
		  				self._output_file.write('Not creating a release because no files have changed\n')
		  			}
		  			return callback(old_release);
		  		}
		  	};
		  	checksums = { 'cloud': script_checksums,
		                  'public': hosted_checksums }
		    args = { 'userFiles' : { 'cloud': script_version_map,
		                             'public': hosted_version_map },
		             'checksums' : checksums,
		             'description' : description,
		             'parseVersion' : parse_version }
		    response = self._http_client.post('1/deploy', args)
		    response = response.body;
		    if (!response) {
		    	 if (!for_develop) {
		    		self._output_file.write('Error talking to the Parse servers, please try again\n')
		        	return callback();
	    		};
	    		return callback(old_release);
		    }

		    if (response.error) {
		    	self._output_file.write("Update failed with %s\n", response['error'])
		      if(!for_develop){
		      	return callback();
		      }
		      old_release['checksums'] = checksums
		      return callback(old_release);
		    }else{
		    	if (for_develop) {
		    		self._output_file.write("Your changes are now live.\n")
		    	}else{
		    		self._output_file.write("New release is named %s (using Parse JavaScript SDK v%s)\n" , response['releaseName'], response['parseVersion'])
		    	}
		    	return callback({
			        'parseVersion': response['parseVersion'],
			        'userFiles' : { 'cloud': script_version_map,
			                        'public': hosted_version_map },
			        'checksums' : { 'cloud': script_checksums,
			                        'public': hosted_checksums }
			      });
		    }
		});
}

StageHandler.prototype.print_log_lines_and_return_timestamp = function(args, ignore_empty_messages){
	var self = this;
	var log_lines = self._http_client.get('1/scriptlog', args);
	log_lines = log_lines.body;
	log_lines.reverse();

	if (log_lines.length === 0 && ! ignore_empty_messages) {
		self._output_file.write("There are no log messages\n")
	};
	log_lines.forEach(function(line){
		var message = line['message'];
		self._output_file.write('%s \n', message);
	});

	var last_start_time;
	if (log_lines.length > 0) {
		last_start_time = JSON.stringify(log_lines[log_lines.length -1]['timestamp']);
	}
	if (!last_start_time && args['startTime']) {
		last_start_time = args['startTime']
	}
	return last_start_time;
}

StageHandler.prototype.tail = function(n, f, level, iterations){
	var self = this;
	var args ={};
	n ? args['n'] = n : null ;
	level ? args['level'] = level : null;
	last_start_time = self.print_log_lines_and_return_timestamp(args, f)
    count = 1;
    async.whilst(function(){
    	return f && (!iterations || count < iterations)
    },
    function(cb){
    	if (last_start_time) {
    		args['startTime'] = last_start_time;
    	}
    	last_start_time = self.print_log_lines_and_return_timestamp(args, true);
    	count ++;
    	setTimeout(cb, 10);
    });
}

StageHandler.prototype.develop = function(get_parse_version, update_parse_version, time_between_deploys, num_iterations,always_get_version_from_server)
{
	var self = this;
	var count = 0;
	var tail_params = {
		n:1,
		level: 'INFO'
	}

	time_between_deploys = time_between_deploys || 1;
	var old_version;
	async.whilst(function(){
		return !num_iterations || count < num_iterations;
	}, function(cb){
		count ++;
		var now = new Date().getTime();
		var next_iteration = now + time_between_deploys;
		var old_parse_version = get_parse_version();
		self.deploy(null, old_parse_version, true, old_version, function(new_version){
			if (new_version &&  new_version['parseVersion'] &&
	          old_parse_version != new_version['parseVersion']){
				update_parse_version(new_version['parseVersion'])
			}
			if (!always_get_version_from_server) {
				old_version = new_version;
			};
			//async.whilst(function(){
			//	return new Date().getTime() < next_iteration;
			//}, function(cb){
			start_time = self.print_log_lines_and_return_timestamp(tail_params, true)
	        if(start_time){
	        	 tail_params['startTime'] = start_time
	        }
        	tail_params['n'] = 100
		        	//setTimeout(cb, 10);
			//});
			setTimeout(cb, 10);
		});
		
	})
}

StageHandler.prototype.releases = function(){
	releases = self._http_client.get('1/releases')
	releases = JSON.parse(releases);
	self._output_file.write('Name\t\tDescription\t\t\tDate\n')
	releases.forEach(function(release){
		release_notes = release['description'] || 'No release notes given';
		self._output_file.write(
              '%s\t\t%s\t%s\n', release['version'], release_notes,
                                    release['timestamp'])
	});
}


module.exports = exports = {
	StageHandler : StageHandler,
	ParseHTTPClient: ParseHTTPClient,
}


