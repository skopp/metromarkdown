angular.module('platen.services').factory('fileManager', function() {
  var fs;
  var SIZE = 10 * 1024 * 1024; // 10 megabytes
  var LIST_FILE = 1;
  var READ_FILE = 2;
  var REMOVE_FILE = 3;

  var doCreate = {
    create: true
  };

  var dontCreate = {
    create: false
  };

  var DEFAULT_FILE_TYPE = {
    type: 'text/plain'
  };

  var getError = function(e, step) {
    return 'Error ' + e.code + ': ' + e.name + ' ' + step;
  };

  // add "name" property to FileError prototype for easier error reporting
  FileError.prototype.__defineGetter__('name', function() {
    var keys = Object.keys(FileError);

    _.each(keys, function(key) {
      if (FileError[key] === this.code) {
        return key;
      }
    });

    return 'Unknown Error';
  });

  var getFileEntryAndDoAction = function(filePath, createParam, actionCallback, onErrorCallback) {
    if (fs) {
      fs.root.getFile(filePath, createParam, actionCallback, onErrorCallback);
    }
  };

  var processFile = function(filePath, createParam, onSuccessCallback, onErrorCallback) {
    if (fs) {
      fs.root.getFile(filePath, createParam, function(fileEntry) {
        fileEntry.file(onSuccessCallback, onErrorCallback);
      }, onErrorCallback);
    }
  };

  var getFileSystem = function(onSuccessCallback, onErrorCallback) {
    window.webkitRequestFileSystem(PERSISTENT, SIZE, function(fileSystem) {
      fs = fileSystem;
      onSuccessCallback();
    }, function(e) {
      onErrorCallback(getError(e, "while initializing file system"));
    });
  };

  return {
    directoryAccessActions: {
      LIST: LIST_FILE,
      READ: READ_FILE,
      REMOVE: REMOVE_FILE
    },

    initialize: function(onSuccessCallback, onErrorCallback) {
      getFileSystem(onSuccessCallback, onErrorCallback);
    },

    accessFilesInDirectory: function(directoryPath, accessAction, onSuccessCallback, onErrorCallback) {

      var accessFiles = function() {
        fs.root.getDirectory(directoryPath, doCreate, function(dirEntry) {
          dirEntry.createReader().readEntries(function(entries) {
            _.each(entries, readEntry);
          }, function(e) {
            onErrorCallback(getError(e, "while reading entries in " + directoryPath));
          });
        }, function(e) {
          onErrorCallback(getError(e, "while reading getting directory " + directoryPath));
        });
      };

      var readEntry = function(entry) {
        if (entry.isFile) {
          switch (accessAction) {
            case LIST_FILE:
              onSuccessCallback(entry);
              break;

            case READ_FILE:
              processFile(entry.fullPath, dontCreate, function(file) {
                var reader = new FileReader();
                reader.onloadend = function(e) {
                  onSuccessCallback(this.result);
                };
                reader.readAsText(file);
              }, function(e) {
                onErrorCallback(getError(e, "while reading file " + entry.fullPath));
              });
              break;

            case REMOVE_FILE:
              getFileEntryAndDoAction(entry.fullPath, dontCreate, function(fileEntry) {
                fileEntry.remove(onSuccessCallback, function(e) {
                  onErrorCallback(getError(e, " while removing file " + entry.fullPath));
                });
              });
              break;

            default:
              onSuccessCallback(entry);
              break;
          }
        }
      };

      if (fs) {
        accessFiles();
      } else {
        getFileSystem(accessFiles, onErrorCallback);
      }
    },

    writeFile: function(filePath, fileBody, onSuccessCallback, onErrorCallback) {
      var blob;

      if (fileBody instanceof Blob) {
        blob = fileBody;
      } else {
        blob = new Blob([fileBody], DEFAULT_FILE_TYPE);
      }

      getFileEntryAndDoAction(filePath, doCreate, function(fileEntry) {
        fileEntry.createWriter(function(fileWriter) {
          fileWriter.onerror = onErrorCallback;
          fileWriter.onwriteend = function() {
            fileWriter.onwriteend = null;
            fileWriter.write(blob);
            onSuccessCallback(fileEntry);
          };

          // a call to truncate() is apparently required if a file is being overriden
          // without this call, there may be extra bits in the newly written file
          fileWriter.truncate(blob.size);

        }, function(e) {
          onErrorCallback(getError(e, " while creating fileWriter for " + filePath));
        }, function(e) {
          onErrorCallback(getError(e, " while creating fileWriter for " + filePath));
        });
      });
    },

    readFile: function(filePath, asText, onSuccessCallback, onErrorCallback) {
      processFile(filePath, dontCreate, function(file) {
        var reader = new FileReader();
        reader.onloadend = function(e) {
          onSuccessCallback(this.result);
        };
        if (asText) {
          reader.readAsText(file);
        } else {
          reader.readAsBinaryString(file);
        }
      }, function(e) {
        onErrorCallback(getError(e, "while reading file " + filePath));
      });
    },

    removeFile: function(filePath, onSuccessCallback, onErrorCallback) {
      var doError = function(e) {
        onErrorCallback(getError(e, " while removing file " + filePath));
      };

      var doAction = function(fileEntry) {
        fileEntry.remove(onSuccessCallback, doError);
      };

      getFileEntryAndDoAction(filePath, dontCreate, doAction, doError);
    },

    createDirectory: function(directoryPath, onSuccessCallback, onErrorCallback) {
      fs.root.getDirectory(directoryPath, doCreate, onSuccessCallback, function(e) {
        onErrorCallback(getError(e, " while creating directory " + directoryPath));
      });
    },
  };
});