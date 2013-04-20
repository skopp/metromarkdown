angular.module('platen.services').factory('wordpress', ['$dialog', 'logger', function($dialog, logger) {
  var POST_TYPE = 'post';
  var DEFAULT_BLOG_ID = 1;
  var DEFAULT_AUTHOR_ID = 1;

  var l = {
    url: localStorage['url'],
    username: localStorage['username'],
    password: localStorage['password'],
    shouldStoreCredentials: false
  }

  var wp = null;

  var initialize = function(onSuccessCallback, onErrorCallback) {
    if (l.url.trim() === '' || l.username.trim() === '' || l.password.trim() === '') {
      var d = $dialog.dialog({
        backdrop: true,
        keyboard: true,
        backdropClick: true,
        controller: 'LoginController',
        templateUrl: 'views/pages/login.html'
      });

      d.open().then(function() {
        createConnection(onSuccessCallback, onErrorCallback);
      });
    } else {
      createConnection(onSuccessCallback, onErrorCallback);
    }
  };

  var createConnection = function(onSuccessCallback, onErrorCallback) {
    var fullUrl = l.url.replace(/\/$/, "") + "/xmlrpc.php";

    try {
      wp = new WordPress(fullUrl, l.username, l.password);
      logger.log("logged into blog '" + l.url + "'", "wordpress service");

      if (l.shouldStoreCredentials) {
        localStorage['url'] = l.url;
        localStorage['username'] = l.username;
        localStorage['password'] = l.password;
        logger.log("saved login credentials for blog + '" + l.url + "'", "wordpress service");

      }

      onSuccessCallback();

    } catch (e) {
      logger.log("unable to log into blog '" + l.url + "': " + e.message, "wordpress service");
      onErrorCallback(e.message);
    }
  };

  var save = function(post, onSuccessCallback, onErrorCallback) {
    var result;

    var data = {
      post_type: POST_TYPE,
      post_status: post.status,
      post_title: post.title,
      post_author: DEFAULT_AUTHOR_ID,
      post_excerpt: post.excerpt,
      post_content: post.content,
      post_format: ''
    };

    if (post.wordPressId) {
      result = wp.editPost(DEFAULT_BLOG_ID, post.wordPressId, data);
      processResponse(result, post, function() {
        logger.log("updated post '" + post.title + "' in blog '" + l.url + "'", "wordpress service");
      }, onErrorCallback);

    } else {
      result = wp.newPost(DEFAULT_BLOG_ID, data);
      processResponse(result, post, function() {
        onSuccessCallback(result.concat());
        logger.log("created post '" + post.title + "' in blog '" + l.url + "'", "wordpress service");
      }, onErrorCallback);
    }
  };

  var processResponse = function(result, post, onSuccessCallback, onErrorCallback) {
    if (result.faultCode) {
      var err = result.faultString.concat()
      logger.log("error for post '" + post.title + "' in blog '" + l.url + "': " + err, "wordpress service");
      onErrorCallback(err);
    } else {
      onSuccessCallback();
    }
  };

  return {
    login: l,

    resetCredentials: function() {
      localStorage['url'] = '';
      localStorage['username'] = '';
      localStorage['password'] = '';

      l.url = '';
      l.username = '';
      l.password = '';
      logger.log("reset credentials", "wordpress service");
    },

    getPost: function(postId) {
      if (!wp) initialize();
    },

    savePost: function(post, onSuccessCallback, onErrorCallback) {
      if (!wp) {
        initialize(function() {
          save(post, onSuccessCallback, onErrorCallback);
        }, onErrorCallback);
      } else {
        save(post, onSuccessCallback, onErrorCallback);
      }
    }
  }
}]);