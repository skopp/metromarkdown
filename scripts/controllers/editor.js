var EditorController = function($rootScope, $scope, $routeParams, $timeout, $filter, $q, fileManager, logger, wordpress, resources) {
  var AUTOSAVE_INTERVAL = 12000;
  var STATUS_DRAFT = 'draft';
  var STATUS_PUBLISH = 'publish';
  var POST_TITLE_ID = 'post-title';
  var POST_CONTENT_ID = 'post-content';
  var POST_EXCERPT = 'post-excerpt';
  var POST_TAGS = 'post-tags';
  var POST_CATEGORIES = 'post-categories';
  var IMAGE_TYPE = 'image/png';
  var INSERTED_IMAGE_PLACEHOLDER = '[[!@#IMAGE_PLACEHOLDER#@!]]';

  $scope.status = {};
  $scope.previewOn = false;
  $scope.status.autoSaveTime = "unsaved";
  $scope.showMetadata = false;

  $scope.post = {};

  var getFilePath = function(postId) {
    return "/" + resources.POST_DIRECTORY_PATH + '/' + postId;
  };

  var createPost = function() {
    $scope.post.id = new Date().getTime();
    $scope.post.path = getFilePath($scope.post.id);
    $scope.post.status = STATUS_DRAFT;
    $scope.post.title = '';
    $scope.post.images = {};

    /* there are 4 representations of the post:
        contentMarkdown - raw text written using markdown formatting (innerText property of the editor window)
        contentMarkdownHTML - markdown text, HTMLified by the browswer (innerHTML property of the editor window)
        contentHTMLPreview - markdown text converted to HTML (innerHTML content of the preview window)
        content - markdown text converted to HTML and encoded (i.e. content of the post for Wordpress)
    */

    $scope.post.content = '';
    $scope.post.contentMarkdown = ''; // set by editable-markdown directive
    $scope.post.contentMarkdownHtml = '';
    $scope.post.contentHtmlPreview = '';

    $scope.post.excerpt = '';
    $scope.post.createdDate = new Date();
    $scope.post.lastUpdatedDate = '';
    $scope.post.tags = '';
    $scope.post.categories = '';
  };

  var loadPost = function(postId) {
    fileManager.readFile(getFilePath(postId), true, function(postJson) {
      $scope.post = JSON.parse(postJson);

      if (!$scope.post.images) {
        $scope.post.images = {};
      }

      $scope.$apply();
      logger.log("loaded post '" + $scope.post.title + "'", "EditorController");
    });
  };

  var initializePost = function() {
    if ($routeParams.postId === "0") {
      createPost();
    } else {
      loadPost($routeParams.postId);
    }
  };

  var uploadImage = function(image) {
    var d = $q.defer();

    fileManager.readFile(image.filePath, false, function(imageData) {
      wordpress.uploadFile(image.fileName, image.type, imageData, function(id, url) {
        image.blogUrl = url;
        image.blogId = id;
        savePost();

        logger.log("uploaded image" + image.fileName, "EditorController");
        d.resolve();
      },

      function(e) {
        logger.log("error uploading image " + image.fileName, "EditorController");
      })
    });

    return d.promise;
  };

  var uploadImages = function(content, onCompletionCallback) {
    var promises = [];

    _.each($scope.post.images, function(image) {
      if (!image.blogId || !image.blogId.trim() === '') {
        // for each image to be uploaded, initiate upload to wordpress
        // because this operation is asyncronous, we need to get a promise for it
        promises.push(uploadImage(image));
      }
    });

    // once all promises are fullfilled (i.e. all items have been uploaded),
    // proceed with uploading the post
    $q.all(promises).then(onCompletionCallback);
  };

  var insertImage = function(blob) {
    $scope.imageToInsert = {};
    $scope.imageToInsert.blob = blob;

    // need to insert a temporary token into the body of the post
    // which will be replaced (or removed) once the user enters file name
    document.execCommand('insertHtml', false, INSERTED_IMAGE_PLACEHOLDER);

    $scope.insertImageDialogOpen = true;
  };

  $scope.proceedWithImageInsert = function() {
    $scope.insertImageDialogOpen = false;

    // TODO: handle images pasted as text/html

    var fileName = $scope.imageToInsert.fileName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    if (fileName.indexOf('.png') === -1) {
      fileName += '.png';
    }

    var image = {
      id: new Date().getTime(),
      type: IMAGE_TYPE,
      fileName: fileName,
      filePath: resources.IMAGE_DIRECTORY_PATH + "/" + fileName
    };

    var contentMarkdownHtml = $scope.post.contentMarkdownHtml;

    fileManager.writeFile(image.filePath, $scope.imageToInsert.blob, function(fileEntry) {
      logger.log("saved image " + image.fileName, "EditorController");

      image.localUrl = fileEntry.toURL();
      image.markdownUrl = '![' + image.fileName + '](' + image.localUrl + ')';

      $scope.post.contentMarkdownHtml = contentMarkdownHtml.replace(INSERTED_IMAGE_PLACEHOLDER, image.markdownUrl);
      $scope.post.images[image.id] = image;

      savePost();
      image = {};
    });
  };

  $scope.cancelImageInsert = function() {
    $scope.imageToInsert = {};
    $scope.post.contentMarkdownHtml = $scope.post.contentMarkdownHtml.replace(INSERTED_IMAGE_PLACEHOLDER, '');
    $('#post-content').focus();
    $scope.insertImageDialogOpen = false;
  };

  initializePost();

  $('#post-title').focus();

  var savePost = function() {
    if ($scope.post.title.trim() === '' && $scope.post.contentMarkdown.trim() === '') return;
     var postToSave = JSON.parse(JSON.stringify($scope.post));

    // since there are 4 different representations of the same content, we only need to save one of them
    postToSave.content = '';
    postToSave.contentHtmlPreview = '';
    postToSave.lastUpdatedDate = new Date();

    fileManager.writeFile(getFilePath($scope.post.id), JSON.stringify(postToSave), function(fileEntry) {
      $scope.status.autoSaveTime = $filter('date')(new Date(), 'shortTime');
      $scope.$apply();

       logger.log("saved post '" + $scope.post.title + "' on " + $scope.status.autoSaveTime, "EditorController");

    }, function() {
      // $scope.$emit(resources.events.PROCESSING_FINISHED, "error saving post", false);
    });
  };

  $scope.togglePreview = function() {
    if (!$scope.previewOn) {
      $scope.post.contentHtmlPreview = marked($scope.post.contentMarkdown);
    };
    $scope.previewOn = !$scope.previewOn;
  };

  $scope.toggleMetadataPanel = function() {
    $scope.showMetadata = !$scope.showMetadata;

    if ($scope.showMetadata && $scope.post.excerpt === '') {
      $scope.updateExcerpt();
    }
    if ($scope.showMetadata) {
      $('#post-excerpt').focus();
    }
  };

  $scope.updateExcerpt = function() {
    $scope.post.excerpt = $scope.post.contentMarkdown.match(/^(.*)$/m)[0];
    savePost();
  };

  $scope.read = function() {
    loadPost($scope.post.id);
  };

  $scope.sync = function() {
    $scope.$emit(resources.events.PROCESSING_STARTED, "uploading post to WordPress");

    $scope.post.content = marked($scope.post.contentMarkdown).replace(/</g, '&lt;').replace(/>/g, '&gt;');

    uploadImages($scope.post.content, function() {
      var content = $scope.post.content;

      _.each($scope.post.images, function(image) {
        content = content.replace(image.localUrl, image.blogUrl);
      });

      $scope.post.content = content;
      wordpress.savePost($scope.post, function(result) {
        console.log("finished wordpress upload in editor");
        $scope.post.wordPressId = result;
        savePost();
        $scope.$emit(resources.events.PROCESSING_FINISHED, {message: "upload to WordPress complete", success: true});

      }, function(errorMessage) {
        $scope.$emit(resources.events.PROCESSING_FINISHED, {message: "upload to WordPress failed", success: false});
      });
    });

  };

  $scope.getTags = function() {
    wordpress.getTags(function(result) {
      $scope.tags = result;

    }, function(errorMessage) {
      alert("OOPS " + errorMessage);
    });
  }

  $scope.addTag = function(tag) {
    if ($scope.post.tags.indexOf(tag.name) === -1) {
      if ($scope.post.tags.trim() === '') {
        $scope.post.tags += tag.name;
      } else {
        $scope.post.tags += ', ' + tag.name;
      }
    }
  };

  $scope.getCategories = function() {
    wordpress.getCategories(function(result) {
      $scope.categories = result;

    }, function(errorMessage) {
      alert("OOPS " + errorMessage);
    });
  }

  $scope.addCategory = function(category) {
    if ($scope.post.categories.indexOf(category.name) === -1) {
      if ($scope.post.categories.trim() === '') {
        $scope.post.categories += category.name;
      } else {
        $scope.post.categories += ', ' + category.name;
      }
    }
  };

  $scope.imagesAvailable = function() {
    return !($.isEmptyObject($scope.post.images));
  };

  $scope.deleteImage = function(image) {
    $scope.imageToDelete = image;
    $scope.deleteImageConfirmOpen = true;
  };

  $scope.cancelImageDelete = function() {
    $scope.deleteImageConfirmOpen = false;
    $scope.imageToDelete = {};
  };

  $scope.proceedWithImageDelete = function() {
    $scope.deleteImageConfirmOpen = false;

    fileManager.removeFile($scope.imageToDelete.filePath, function() {
      delete $scope.post.images[$scope.imageToDelete.id];
      savePost();
      logger.log("deleted image '" + $scope.imageToDelete.fileName + "'", "EditorController");
      $scope.imageToDelete = {};
    });
  };

  $scope.$on('elementEdited', function(event, elementId) {
    if (elementId === POST_TITLE_ID || elementId === POST_CONTENT_ID || elementId === POST_EXCERPT || elementId === POST_TAGS || elementId || POST_CATEGORIES) {
      savePost();
    }
  });

  $scope.$on('imageInserted', function(event, blob) {
    insertImage(blob);
  });
};

EditorController.$inject = ['$rootScope', '$scope', '$routeParams', '$timeout', '$filter', '$q', 'fileManager', 'logger', 'wordpress', 'resources'];