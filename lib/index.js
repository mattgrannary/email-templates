"use strict";

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest(); }

function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance"); }

function _iterableToArrayLimit(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"] != null) _i["return"](); } finally { if (_d) throw _e; } } return _arr; }

function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

const fs = require('fs');

const path = require('path');

const juice = require('juice');

const debug = require('debug')('email-templates');

const htmlToText = require('html-to-text'); // const I18N = require('@ladjs/i18n');


const autoBind = require('auto-bind');

const nodemailer = require('nodemailer');

const consolidate = require('consolidate');

const previewEmail = require('preview-email');

const _ = require('lodash');

const _Promise = require('bluebird');

const s = require('underscore.string');

const getPaths = require('get-paths'); // promise version of `juice.juiceResources`


const juiceResources = (html, options) => {
  return new _Promise((resolve, reject) => {
    juice.juiceResources(html, options, (err, html) => {
      if (err) return reject(err);
      resolve(html);
    });
  });
};

const env = (process.env.NODE_ENV || 'development').toLowerCase();

const stat = _Promise.promisify(fs.stat);

const readFile = _Promise.promisify(fs.readFile);

class Email {
  constructor(config = {}) {
    debug('config passed %O', config); // 2.x backwards compatible support

    if (config.juiceOptions) {
      config.juiceResources = config.juiceOptions;
      delete config.juiceOptions;
    }

    if (config.disableJuice) {
      config.juice = false;
      delete config.disableJuice;
    }

    if (config.render) {
      config.customRender = true;
    }

    this.config = _.merge({
      views: {
        // directory where email templates reside
        root: path.resolve('emails'),
        options: {
          // default file extension for template
          extension: 'pug',
          map: {
            hbs: 'handlebars',
            njk: 'nunjucks'
          },
          engineSource: consolidate
        },
        // locals to pass to templates for rendering
        locals: {
          // pretty is automatically set to `false` for subject/text
          pretty: true
        }
      },
      // <https://nodemailer.com/message/>
      message: {},
      send: !['development', 'test'].includes(env),
      preview: env === 'development',
      // <https://github.com/ladjs/i18n>
      // set to an object to configure and enable it
      i18n: false,
      // pass a custom render function if necessary
      render: this.render.bind(this),
      customRender: false,
      // force text-only rendering of template (disregards template folder)
      textOnly: false,
      // <https://github.com/werk85/node-html-to-text>
      htmlToText: {
        ignoreImage: true
      },
      subjectPrefix: false,
      // <https://github.com/Automattic/juice>
      juice: true,
      juiceResources: {
        preserveImportant: true,
        webResources: {
          relativeTo: path.resolve('build'),
          images: false
        }
      },
      // pass a transport configuration object or a transport instance
      // (e.g. an instance is created via `nodemailer.createTransport`)
      // <https://nodemailer.com/transports/>
      transport: {}
    }, config); // override existing method

    this.render = this.config.render;
    if (!_.isFunction(this.config.transport.sendMail)) this.config.transport = nodemailer.createTransport(this.config.transport);
    debug('transformed config %O', this.config);
    autoBind(this);
  } // shorthand use of `juiceResources` with the config
  // (mainly for custom renders like from a database)


  juiceResources(html) {
    return juiceResources(html, this.config.juiceResources);
  } // a simple helper function that gets the actual file path for the template


  getTemplatePath(template) {
    var _this = this;

    return _asyncToGenerator(function* () {
      const _ref = path.isAbsolute(template) ? [path.dirname(template), path.basename(template)] : [_this.config.views.root, template],
            _ref2 = _slicedToArray(_ref, 2),
            root = _ref2[0],
            view = _ref2[1];

      const paths = yield getPaths(root, view, _this.config.views.options.extension);
      const filePath = path.resolve(root, paths.rel);
      return {
        filePath,
        paths
      };
    })();
  } // returns true or false if a template exists
  // (uses same look-up approach as `render` function)


  templateExists(view) {
    var _this2 = this;

    return _asyncToGenerator(function* () {
      try {
        const _ref3 = yield _this2.getTemplatePath(view),
              filePath = _ref3.filePath;

        const stats = yield stat(filePath);
        if (!stats.isFile()) throw new Error(`${filePath} was not a file`);
        return true;
      } catch (err) {
        debug('templateExists', err);
        return false;
      }
    })();
  } // promise version of consolidate's render
  // inspired by koa-views and re-uses the same config
  // <https://github.com/queckezz/koa-views>


  render(view, locals = {}) {
    var _this3 = this;

    return _asyncToGenerator(function* () {
      const _this3$config$views$o = _this3.config.views.options,
            map = _this3$config$views$o.map,
            engineSource = _this3$config$views$o.engineSource;

      const _ref4 = yield _this3.getTemplatePath(view),
            filePath = _ref4.filePath,
            paths = _ref4.paths;

      if (paths.ext === 'html' && !map) {
        const res = yield readFile(filePath, 'utf8');
        return res;
      }

      const engineName = map && map[paths.ext] ? map[paths.ext] : paths.ext;
      const renderFn = engineSource[engineName];
      if (!engineName || !renderFn) throw new Error(`Engine not found for the ".${paths.ext}" file extension`); // if (_.isObject(this.config.i18n)) {
      //   const i18n = new I18N(
      //     Object.assign({}, this.config.i18n, {
      //       register: locals
      //     })
      //   );
      //   // support `locals.user.last_locale`
      //   // (e.g. for <https://lad.js.org>)
      //   if (_.isObject(locals.user) && _.isString(locals.user.last_locale))
      //     locals.locale = locals.user.last_locale;
      //   if (_.isString(locals.locale)) i18n.setLocale(locals.locale);
      // }

      const res = yield _Promise.promisify(renderFn)(filePath, locals); // transform the html with juice using remote paths
      // google now supports media queries
      // https://developers.google.com/gmail/design/reference/supported_css

      if (!_this3.config.juice) return res;
      const html = yield _this3.juiceResources(res);
      return html;
    })();
  } // TODO: this needs refactored
  // so that we render templates asynchronously


  renderAll(template, locals = {}, message = {}) {
    var _this4 = this;

    return _asyncToGenerator(function* () {
      let subjectTemplateExists = _this4.config.customRender;
      let htmlTemplateExists = _this4.config.customRender;
      let textTemplateExists = _this4.config.customRender;

      if (template && !_this4.config.customRender) {
        var _ref5 = yield _Promise.all([_this4.templateExists(`${template}/subject`), _this4.templateExists(`${template}/html`), _this4.templateExists(`${template}/text`)]);

        var _ref6 = _slicedToArray(_ref5, 3);

        subjectTemplateExists = _ref6[0];
        htmlTemplateExists = _ref6[1];
        textTemplateExists = _ref6[2];
      }

      if (!message.subject && subjectTemplateExists) {
        message.subject = yield _this4.render(`${template}/subject`, Object.assign({}, locals, {
          pretty: false
        }));
        message.subject = message.subject.trim();
      }

      if (message.subject && _this4.config.subjectPrefix) message.subject = _this4.config.subjectPrefix + message.subject;
      if (!message.html && htmlTemplateExists) message.html = yield _this4.render(`${template}/html`, locals);
      if (!message.text && textTemplateExists) message.text = yield _this4.render(`${template}/text`, Object.assign({}, locals, {
        pretty: false
      }));
      if (_this4.config.htmlToText && message.html && !message.text) // we'd use nodemailer-html-to-text plugin
        // but we really don't need to support cid
        // <https://github.com/andris9/nodemailer-html-to-text>
        message.text = htmlToText.fromString(message.html, _this4.config.htmlToText); // if we only want a text-based version of the email

      if (_this4.config.textOnly) delete message.html; // if no subject, html, or text content exists then we should
      // throw an error that says at least one must be found
      // otherwise the email would be blank (defeats purpose of email-templates)

      if (s.isBlank(message.subject) && s.isBlank(message.text) && s.isBlank(message.html) && _.isArray(message.attachments) && _.isEmpty(message.attachments)) throw new Error(`No content was passed for subject, html, text, nor attachments message props. Check that the files for the template "${template}" exist.`);
      return message;
    })();
  }

  send(options = {}) {
    var _this5 = this;

    return _asyncToGenerator(function* () {
      options = Object.assign({
        template: '',
        message: {},
        locals: {}
      }, options);
      let _options = options,
          template = _options.template,
          message = _options.message,
          locals = _options.locals;
      const attachments = message.attachments || _this5.config.message.attachments || [];
      message = _.defaultsDeep({}, _.omit(message, 'attachments'), _.omit(_this5.config.message, 'attachments'));
      locals = _.defaultsDeep({}, _this5.config.views.locals, locals);
      if (attachments) message.attachments = attachments;
      debug('template %s', template);
      debug('message %O', message);
      debug('locals (keys only): %O', Object.keys(locals)); // get all available templates

      const obj = yield _this5.renderAll(template, locals, message); // assign the object variables over to the message

      Object.assign(message, obj);

      if (_this5.config.preview) {
        debug('using `preview-email` to preview email');
        if (_.isObject(_this5.config.preview)) yield previewEmail(message, null, true, _this5.config.preview);else yield previewEmail(message);
      }

      if (!_this5.config.send) {
        debug('send disabled so we are ensuring JSONTransport'); // <https://github.com/nodemailer/nodemailer/issues/798>
        // if (this.config.transport.name !== 'JSONTransport')

        _this5.config.transport = nodemailer.createTransport({
          jsonTransport: true
        });
      }

      const res = yield _this5.config.transport.sendMail(message);
      debug('message sent');
      res.originalMessage = message;
      return res;
    })();
  }

}

module.exports = Email;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJuYW1lcyI6WyJmcyIsInJlcXVpcmUiLCJwYXRoIiwianVpY2UiLCJkZWJ1ZyIsImh0bWxUb1RleHQiLCJhdXRvQmluZCIsIm5vZGVtYWlsZXIiLCJjb25zb2xpZGF0ZSIsInByZXZpZXdFbWFpbCIsIl8iLCJQcm9taXNlIiwicyIsImdldFBhdGhzIiwianVpY2VSZXNvdXJjZXMiLCJodG1sIiwib3B0aW9ucyIsInJlc29sdmUiLCJyZWplY3QiLCJlcnIiLCJlbnYiLCJwcm9jZXNzIiwiTk9ERV9FTlYiLCJ0b0xvd2VyQ2FzZSIsInN0YXQiLCJwcm9taXNpZnkiLCJyZWFkRmlsZSIsIkVtYWlsIiwiY29uc3RydWN0b3IiLCJjb25maWciLCJqdWljZU9wdGlvbnMiLCJkaXNhYmxlSnVpY2UiLCJyZW5kZXIiLCJjdXN0b21SZW5kZXIiLCJtZXJnZSIsInZpZXdzIiwicm9vdCIsImV4dGVuc2lvbiIsIm1hcCIsImhicyIsIm5qayIsImVuZ2luZVNvdXJjZSIsImxvY2FscyIsInByZXR0eSIsIm1lc3NhZ2UiLCJzZW5kIiwiaW5jbHVkZXMiLCJwcmV2aWV3IiwiaTE4biIsImJpbmQiLCJ0ZXh0T25seSIsImlnbm9yZUltYWdlIiwic3ViamVjdFByZWZpeCIsInByZXNlcnZlSW1wb3J0YW50Iiwid2ViUmVzb3VyY2VzIiwicmVsYXRpdmVUbyIsImltYWdlcyIsInRyYW5zcG9ydCIsImlzRnVuY3Rpb24iLCJzZW5kTWFpbCIsImNyZWF0ZVRyYW5zcG9ydCIsImdldFRlbXBsYXRlUGF0aCIsInRlbXBsYXRlIiwiaXNBYnNvbHV0ZSIsImRpcm5hbWUiLCJiYXNlbmFtZSIsInZpZXciLCJwYXRocyIsImZpbGVQYXRoIiwicmVsIiwidGVtcGxhdGVFeGlzdHMiLCJzdGF0cyIsImlzRmlsZSIsIkVycm9yIiwiZXh0IiwicmVzIiwiZW5naW5lTmFtZSIsInJlbmRlckZuIiwicmVuZGVyQWxsIiwic3ViamVjdFRlbXBsYXRlRXhpc3RzIiwiaHRtbFRlbXBsYXRlRXhpc3RzIiwidGV4dFRlbXBsYXRlRXhpc3RzIiwiYWxsIiwic3ViamVjdCIsIk9iamVjdCIsImFzc2lnbiIsInRyaW0iLCJ0ZXh0IiwiZnJvbVN0cmluZyIsImlzQmxhbmsiLCJpc0FycmF5IiwiYXR0YWNobWVudHMiLCJpc0VtcHR5IiwiZGVmYXVsdHNEZWVwIiwib21pdCIsImtleXMiLCJvYmoiLCJpc09iamVjdCIsImpzb25UcmFuc3BvcnQiLCJvcmlnaW5hbE1lc3NhZ2UiLCJtb2R1bGUiLCJleHBvcnRzIl0sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7OztBQUFBLE1BQU1BLEVBQUUsR0FBR0MsT0FBTyxDQUFDLElBQUQsQ0FBbEI7O0FBQ0EsTUFBTUMsSUFBSSxHQUFHRCxPQUFPLENBQUMsTUFBRCxDQUFwQjs7QUFDQSxNQUFNRSxLQUFLLEdBQUdGLE9BQU8sQ0FBQyxPQUFELENBQXJCOztBQUNBLE1BQU1HLEtBQUssR0FBR0gsT0FBTyxDQUFDLE9BQUQsQ0FBUCxDQUFpQixpQkFBakIsQ0FBZDs7QUFDQSxNQUFNSSxVQUFVLEdBQUdKLE9BQU8sQ0FBQyxjQUFELENBQTFCLEMsQ0FDQTs7O0FBQ0EsTUFBTUssUUFBUSxHQUFHTCxPQUFPLENBQUMsV0FBRCxDQUF4Qjs7QUFDQSxNQUFNTSxVQUFVLEdBQUdOLE9BQU8sQ0FBQyxZQUFELENBQTFCOztBQUNBLE1BQU1PLFdBQVcsR0FBR1AsT0FBTyxDQUFDLGFBQUQsQ0FBM0I7O0FBQ0EsTUFBTVEsWUFBWSxHQUFHUixPQUFPLENBQUMsZUFBRCxDQUE1Qjs7QUFDQSxNQUFNUyxDQUFDLEdBQUdULE9BQU8sQ0FBQyxRQUFELENBQWpCOztBQUNBLE1BQU1VLFFBQU8sR0FBR1YsT0FBTyxDQUFDLFVBQUQsQ0FBdkI7O0FBQ0EsTUFBTVcsQ0FBQyxHQUFHWCxPQUFPLENBQUMsbUJBQUQsQ0FBakI7O0FBRUEsTUFBTVksUUFBUSxHQUFHWixPQUFPLENBQUMsV0FBRCxDQUF4QixDLENBRUE7OztBQUNBLE1BQU1hLGNBQWMsR0FBRyxD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RHFCLENBRXJCO0FBQ0E7O0FBQ0EsUUFBQSxNQUFJLENBQUN5QixNQUFMLENBQVk0QixTQUFaLEdBQXdCbEQsVUFBVSxDQUFDcUQsZUFBWCxDQUEyQjtBQUNqRHNDLFVBQUFBLGFBQWEsRUFBRTtBQURrQyxTQUEzQixDQUF4QjtBQUdEOztBQUVELFlBQU12QixHQUFHLFNBQVMsTUFBSSxDQUFDOUMsTUFBTCxDQUFZNEIsU0FBWixDQUFzQkUsUUFBdEIsQ0FBK0JmLE9BQS9CLENBQWxCO0FBQ0F4QyxNQUFBQSxLQUFLLENBQUMsY0FBRCxDQUFMO0FBQ0F1RSxNQUFBQSxHQUFHLENBQUN3QixlQUFKLEdBQXNCdkQsT0FBdEI7QUFDQSxhQUFPK0IsR0FBUDtBQXJEdUI7QUFzRHhCOztBQXRSUzs7QUF5Ulp5QixNQUFNLENBQUNDLE9BQVAsR0FBaUIxRSxLQUFqQiIsInNvdXJjZXNDb250ZW50IjpbImNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcbmNvbnN0IHBhdGggPSByZXF1aXJlKCdwYXRoJyk7XG5jb25zdCBqdWljZSA9IHJlcXVpcmUoJ2p1aWNlJyk7XG5jb25zdCBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ2VtYWlsLXRlbXBsYXRlcycpO1xuY29uc3QgaHRtbFRvVGV4dCA9IHJlcXVpcmUoJ2h0bWwtdG8tdGV4dCcpO1xuLy8gY29uc3QgSTE4TiA9IHJlcXVpcmUoJ0BsYWRqcy9pMThuJyk7XG5jb25zdCBhdXRvQmluZCA9IHJlcXVpcmUoJ2F1dG8tYmluZCcpO1xuY29uc3Qgbm9kZW1haWxlciA9IHJlcXVpcmUoJ25vZGVtYWlsZXInKTtcbmNvbnN0IGNvbnNvbGlkYXRlID0gcmVxdWlyZSgnY29uc29saWRhdGUnKTtcbmNvbnN0IHByZXZpZXdFbWFpbCA9IHJlcXVpcmUoJ3ByZXZpZXctZW1haWwnKTtcbmNvbnN0IF8gPSByZXF1aXJlKCdsb2Rhc2gnKTtcbmNvbnN0IFByb21pc2UgPSByZXF1aXJlKCdibHVlYmlyZCcpO1xuY29uc3QgcyA9IHJlcXVpcmUoJ3VuZGVyc2NvcmUuc3RyaW5nJyk7XG5cbmNvbnN0IGdldFBhdGhzID0gcmVxdWlyZSgnZ2V0LXBhdGhzJyk7XG5cbi8vIHByb21pc2UgdmVyc2lvbiBvZiBganVpY2UuanVpY2VSZXNvdXJjZXNgXG5jb25zdCBqdWljZVJlc291cmNlcyA9IChodG1sLCBvcHRpb25zKSA9PiB7XG4gIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAganVpY2UuanVpY2VSZXNvdXJjZXMoaHRtbCwgb3B0aW9ucywgKGVyciwgaHRtbCkgPT4ge1xuICAgICAgaWYgKGVycikgcmV0dXJuIHJlamVjdChlcnIpO1xuICAgICAgcmVzb2x2ZShodG1sKTtcbiAgICB9KTtcbiAgfSk7XG59O1xuXG5jb25zdCBlbnYgPSAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgfHwgJ2RldmVsb3BtZW50JykudG9Mb3dlckNhc2UoKTtcbmNvbnN0IHN0YXQgPSBQcm9taXNlLnByb21pc2lmeShmcy5zdGF0KTtcbmNvbnN0IHJlYWRGaWxlID0gUHJvbWlzZS5wcm9taXNpZnkoZnMucmVhZEZpbGUpO1xuXG5jbGFzcyBFbWFpbCB7XG4gIGNvbnN0cnVjdG9yKGNvbmZpZyA9IHt9KSB7XG4gICAgZGVidWcoJ2NvbmZpZyBwYXNzZWQgJU8nLCBjb25maWcpO1xuXG4gICAgLy8gMi54IGJhY2t3YXJkcyBjb21wYXRpYmxlIHN1cHBvcnRcbiAgICBpZiAoY29uZmlnLmp1aWNlT3B0aW9ucykge1xuICAgICAgY29uZmlnLmp1aWNlUmVzb3VyY2VzID0gY29uZmlnLmp1aWNlT3B0aW9ucztcbiAgICAgIGRlbGV0ZSBjb25maWcuanVpY2VPcHRpb25zO1xuICAgIH1cbiAgICBpZiAoY29uZmlnLmRpc2FibGVKdWljZSkge1xuICAgICAgY29uZmlnLmp1aWNlID0gZmFsc2U7XG4gICAgICBkZWxldGUgY29uZmlnLmRpc2FibGVKdWljZTtcbiAgICB9XG4gICAgaWYgKGNvbmZpZy5yZW5kZXIpIHtcbiAgICAgIGNvbmZpZy5jdXN0b21SZW5kZXIgPSB0cnVlO1xuICAgIH1cblxuICAgIHRoaXMuY29uZmlnID0gXy5tZXJnZShcbiAgICAgIHtcbiAgICAgICAgdmlld3M6IHtcbiAgICAgICAgICAvLyBkaXJlY3Rvcnkgd2hlcmUgZW1haWwgdGVtcGxhdGVzIHJlc2lkZVxuICAgICAgICAgIHJvb3Q6IHBhdGgucmVzb2x2ZSgnZW1haWxzJyksXG4gICAgICAgICAgb3B0aW9uczoge1xuICAgICAgICAgICAgLy8gZGVmYXVsdCBmaWxlIGV4dGVuc2lvbiBmb3IgdGVtcGxhdGVcbiAgICAgICAgICAgIGV4dGVuc2lvbjogJ3B1ZycsXG4gICAgICAgICAgICBtYXA6IHtcbiAgICAgICAgICAgICAgaGJzOiAnaGFuZGxlYmFycycsXG4gICAgICAgICAgICAgIG5qazogJ251bmp1Y2tzJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGVuZ2luZVNvdXJjZTogY29uc29saWRhdGVcbiAgICAgICAgICB9LFxuICAgICAgICAgIC8vIGxvY2FscyB0byBwYXNzIHRvIHRlbXBsYXRlcyBmb3IgcmVuZGVyaW5nXG4gICAgICAgICAgbG9jYWxzOiB7XG4gICAgICAgICAgICAvLyBwcmV0dHkgaXMgYXV0b21hdGljYWxseSBzZXQgdG8gYGZhbHNlYCBmb3Igc3ViamVjdC90ZXh0XG4gICAgICAgICAgICBwcmV0dHk6IHRydWVcbiAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIC8vIDxodHRwczovL25vZGVtYWlsZXIuY29tL21lc3NhZ2UvPlxuICAgICAgICBtZXNzYWdlOiB7fSxcbiAgICAgICAgc2VuZDogIVsnZGV2ZWxvcG1lbnQnLCAndGVzdCddLmluY2x1ZGVzKGVudiksXG4gICAgICAgIHByZXZpZXc6IGVudiA9PT0gJ2RldmVsb3BtZW50JyxcbiAgICAgICAgLy8gPGh0dHBzOi8vZ2l0aHViLmNvbS9sYWRqcy9pMThuPlxuICAgICAgICAvLyBzZXQgdG8gYW4gb2JqZWN0IHRvIGNvbmZpZ3VyZSBhbmQgZW5hYmxlIGl0XG4gICAgICAgIGkxOG46IGZhbHNlLFxuICAgICAgICAvLyBwYXNzIGEgY3VzdG9tIHJlbmRlciBmdW5jdGlvbiBpZiBuZWNlc3NhcnlcbiAgICAgICAgcmVuZGVyOiB0aGlzLnJlbmRlci5iaW5kKHRoaXMpLFxuICAgICAgICBjdXN0b21SZW5kZXI6IGZhbHNlLFxuICAgICAgICAvLyBmb3JjZSB0ZXh0LW9ubHkgcmVuZGVyaW5nIG9mIHRlbXBsYXRlIChkaXNyZWdhcmRzIHRlbXBsYXRlIGZvbGRlcilcbiAgICAgICAgdGV4dE9ubHk6IGZhbHNlLFxuICAgICAgICAvLyA8aHR0cHM6Ly9naXRodWIuY29tL3dlcms4NS9ub2RlLWh0bWwtdG8tdGV4dD5cbiAgICAgICAgaHRtbFRvVGV4dDoge1xuICAgICAgICAgIGlnbm9yZUltYWdlOiB0cnVlXG4gICAgICAgIH0sXG4gICAgICAgIHN1YmplY3RQcmVmaXg6IGZhbHNlLFxuICAgICAgICAvLyA8aHR0cHM6Ly9naXRodWIuY29tL0F1dG9tYXR0aWMvanVpY2U+XG4gICAgICAgIGp1aWNlOiB0cnVlLFxuICAgICAgICBqdWljZVJlc291cmNlczoge1xuICAgICAgICAgIHByZXNlcnZlSW1wb3J0YW50OiB0cnVlLFxuICAgICAgICAgIHdlYlJlc291cmNlczoge1xuICAgICAgICAgICAgcmVsYXRpdmVUbzogcGF0aC5yZXNvbHZlKCdidWlsZCcpLFxuICAgICAgICAgICAgaW1hZ2VzOiBmYWxzZVxuICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgLy8gcGFzcyBhIHRyYW5zcG9ydCBjb25maWd1cmF0aW9uIG9iamVjdCBvciBhIHRyYW5zcG9ydCBpbnN0YW5jZVxuICAgICAgICAvLyAoZS5nLiBhbiBpbnN0YW5jZSBpcyBjcmVhdGVkIHZpYSBgbm9kZW1haWxlci5jcmVhdGVUcmFuc3BvcnRgKVxuICAgICAgICAvLyA8aHR0cHM6Ly9ub2RlbWFpbGVyLmNvbS90cmFuc3BvcnRzLz5cbiAgICAgICAgdHJhbnNwb3J0OiB7fVxuICAgICAgfSxcbiAgICAgIGNvbmZpZ1xuICAgICk7XG5cbiAgICAvLyBvdmVycmlkZSBleGlzdGluZyBtZXRob2RcbiAgICB0aGlzLnJlbmRlciA9IHRoaXMuY29uZmlnLnJlbmRlcjtcblxuICAgIGlmICghXy5pc0Z1bmN0aW9uKHRoaXMuY29uZmlnLnRyYW5zcG9ydC5zZW5kTWFpbCkpXG4gICAgICB0aGlzLmNvbmZpZy50cmFuc3BvcnQgPSBub2RlbWFpbGVyLmNyZWF0ZVRyYW5zcG9ydCh0aGlzLmNvbmZpZy50cmFuc3BvcnQpO1xuXG4gICAgZGVidWcoJ3RyYW5zZm9ybWVkIGNvbmZpZyAlTycsIHRoaXMuY29uZmlnKTtcblxuICAgIGF1dG9CaW5kKHRoaXMpO1xuICB9XG5cbiAgLy8gc2hvcnRoYW5kIHVzZSBvZiBganVpY2VSZXNvdXJjZXNgIHdpdGggdGhlIGNvbmZpZ1xuICAvLyAobWFpbmx5IGZvciBjdXN0b20gcmVuZGVycyBsaWtlIGZyb20gYSBkYXRhYmFzZSlcbiAganVpY2VSZXNvdXJjZXMoaHRtbCkge1xuICAgIHJldHVybiBqdWljZVJlc291cmNlcyhodG1sLCB0aGlzLmNvbmZpZy5qdWljZVJlc291cmNlcyk7XG4gIH1cblxuICAvLyBhIHNpbXBsZSBoZWxwZXIgZnVuY3Rpb24gdGhhdCBnZXRzIHRoZSBhY3R1YWwgZmlsZSBwYXRoIGZvciB0aGUgdGVtcGxhdGVcbiAgYXN5bmMgZ2V0VGVtcGxhdGVQYXRoKHRlbXBsYXRlKSB7XG4gICAgY29uc3QgW3Jvb3QsIHZpZXddID0gcGF0aC5pc0Fic29sdXRlKHRlbXBsYXRlKVxuICAgICAgPyBbcGF0aC5kaXJuYW1lKHRlbXBsYXRlKSwgcGF0aC5iYXNlbmFtZSh0ZW1wbGF0ZSldXG4gICAgICA6IFt0aGlzLmNvbmZpZy52aWV3cy5yb290LCB0ZW1wbGF0ZV07XG4gICAgY29uc3QgcGF0aHMgPSBhd2FpdCBnZXRQYXRocyhcbiAgICAgIHJvb3QsXG4gICAgICB2aWV3LFxuICAgICAgdGhpcy5jb25maWcudmlld3Mub3B0aW9ucy5leHRlbnNpb25cbiAgICApO1xuICAgIGNvbnN0IGZpbGVQYXRoID0gcGF0aC5yZXNvbHZlKHJvb3QsIHBhdGhzLnJlbCk7XG4gICAgcmV0dXJuIHsgZmlsZVBhdGgsIHBhdGhzIH07XG4gIH1cblxuICAvLyByZXR1cm5zIHRydWUgb3IgZmFsc2UgaWYgYSB0ZW1wbGF0ZSBleGlzdHNcbiAgLy8gKHVzZXMgc2FtZSBsb29rLXVwIGFwcHJvYWNoIGFzIGByZW5kZXJgIGZ1bmN0aW9uKVxuICBhc3luYyB0ZW1wbGF0ZUV4aXN0cyh2aWV3KSB7XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHsgZmlsZVBhdGggfSA9IGF3YWl0IHRoaXMuZ2V0VGVtcGxhdGVQYXRoKHZpZXcpO1xuICAgICAgY29uc3Qgc3RhdHMgPSBhd2FpdCBzdGF0KGZpbGVQYXRoKTtcbiAgICAgIGlmICghc3RhdHMuaXNGaWxlKCkpIHRocm93IG5ldyBFcnJvcihgJHtmaWxlUGF0aH0gd2FzIG5vdCBhIGZpbGVgKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgZGVidWcoJ3RlbXBsYXRlRXhpc3RzJywgZXJyKTtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICAvLyBwcm9taXNlIHZlcnNpb24gb2YgY29uc29saWRhdGUncyByZW5kZXJcbiAgLy8gaW5zcGlyZWQgYnkga29hLXZpZXdzIGFuZCByZS11c2VzIHRoZSBzYW1lIGNvbmZpZ1xuICAvLyA8aHR0cHM6Ly9naXRodWIuY29tL3F1ZWNrZXp6L2tvYS12aWV3cz5cbiAgYXN5bmMgcmVuZGVyKHZpZXcsIGxvY2FscyA9IHt9KSB7XG4gICAgY29uc3QgeyBtYXAsIGVuZ2luZVNvdXJjZSB9ID0gdGhpcy5jb25maWcudmlld3Mub3B0aW9ucztcbiAgICBjb25zdCB7IGZpbGVQYXRoLCBwYXRocyB9ID0gYXdhaXQgdGhpcy5nZXRUZW1wbGF0ZVBhdGgodmlldyk7XG4gICAgaWYgKHBhdGhzLmV4dCA9PT0gJ2h0bWwnICYmICFtYXApIHtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IHJlYWRGaWxlKGZpbGVQYXRoLCAndXRmOCcpO1xuICAgICAgcmV0dXJuIHJlcztcbiAgICB9XG4gICAgY29uc3QgZW5naW5lTmFtZSA9IG1hcCAmJiBtYXBbcGF0aHMuZXh0XSA/IG1hcFtwYXRocy5leHRdIDogcGF0aHMuZXh0O1xuICAgIGNvbnN0IHJlbmRlckZuID0gZW5naW5lU291cmNlW2VuZ2luZU5hbWVdO1xuICAgIGlmICghZW5naW5lTmFtZSB8fCAhcmVuZGVyRm4pXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgIGBFbmdpbmUgbm90IGZvdW5kIGZvciB0aGUgXCIuJHtwYXRocy5leHR9XCIgZmlsZSBleHRlbnNpb25gXG4gICAgICApO1xuXG4gICAgLy8gaWYgKF8uaXNPYmplY3QodGhpcy5jb25maWcuaTE4bikpIHtcbiAgICAvLyAgIGNvbnN0IGkxOG4gPSBuZXcgSTE4TihcbiAgICAvLyAgICAgT2JqZWN0LmFzc2lnbih7fSwgdGhpcy5jb25maWcuaTE4biwge1xuICAgIC8vICAgICAgIHJlZ2lzdGVyOiBsb2NhbHNcbiAgICAvLyAgICAgfSlcbiAgICAvLyAgICk7XG5cbiAgICAvLyAgIC8vIHN1cHBvcnQgYGxvY2Fscy51c2VyLmxhc3RfbG9jYWxlYFxuICAgIC8vICAgLy8gKGUuZy4gZm9yIDxodHRwczovL2xhZC5qcy5vcmc+KVxuICAgIC8vICAgaWYgKF8uaXNPYmplY3QobG9jYWxzLnVzZXIpICYmIF8uaXNTdHJpbmcobG9jYWxzLnVzZXIubGFzdF9sb2NhbGUpKVxuICAgIC8vICAgICBsb2NhbHMubG9jYWxlID0gbG9jYWxzLnVzZXIubGFzdF9sb2NhbGU7XG5cbiAgICAvLyAgIGlmIChfLmlzU3RyaW5nKGxvY2Fscy5sb2NhbGUpKSBpMThuLnNldExvY2FsZShsb2NhbHMubG9jYWxlKTtcbiAgICAvLyB9XG5cbiAgICBjb25zdCByZXMgPSBhd2FpdCBQcm9taXNlLnByb21pc2lmeShyZW5kZXJGbikoZmlsZVBhdGgsIGxvY2Fscyk7XG4gICAgLy8gdHJhbnNmb3JtIHRoZSBodG1sIHdpdGgganVpY2UgdXNpbmcgcmVtb3RlIHBhdGhzXG4gICAgLy8gZ29vZ2xlIG5vdyBzdXBwb3J0cyBtZWRpYSBxdWVyaWVzXG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vZ21haWwvZGVzaWduL3JlZmVyZW5jZS9zdXBwb3J0ZWRfY3NzXG4gICAgaWYgKCF0aGlzLmNvbmZpZy5qdWljZSkgcmV0dXJuIHJlcztcbiAgICBjb25zdCBodG1sID0gYXdhaXQgdGhpcy5qdWljZVJlc291cmNlcyhyZXMpO1xuICAgIHJldHVybiBodG1sO1xuICB9XG5cbiAgLy8gVE9ETzogdGhpcyBuZWVkcyByZWZhY3RvcmVkXG4gIC8vIHNvIHRoYXQgd2UgcmVuZGVyIHRlbXBsYXRlcyBhc3luY2hyb25vdXNseVxuICBhc3luYyByZW5kZXJBbGwodGVtcGxhdGUsIGxvY2FscyA9IHt9LCBtZXNzYWdlID0ge30pIHtcbiAgICBsZXQgc3ViamVjdFRlbXBsYXRlRXhpc3RzID0gdGhpcy5jb25maWcuY3VzdG9tUmVuZGVyO1xuICAgIGxldCBodG1sVGVtcGxhdGVFeGlzdHMgPSB0aGlzLmNvbmZpZy5jdXN0b21SZW5kZXI7XG4gICAgbGV0IHRleHRUZW1wbGF0ZUV4aXN0cyA9IHRoaXMuY29uZmlnLmN1c3RvbVJlbmRlcjtcblxuICAgIGlmICh0ZW1wbGF0ZSAmJiAhdGhpcy5jb25maWcuY3VzdG9tUmVuZGVyKVxuICAgICAgW1xuICAgICAgICBzdWJqZWN0VGVtcGxhdGVFeGlzdHMsXG4gICAgICAgIGh0bWxUZW1wbGF0ZUV4aXN0cyxcbiAgICAgICAgdGV4dFRlbXBsYXRlRXhpc3RzXG4gICAgICBdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgICB0aGlzLnRlbXBsYXRlRXhpc3RzKGAke3RlbXBsYXRlfS9zdWJqZWN0YCksXG4gICAgICAgIHRoaXMudGVtcGxhdGVFeGlzdHMoYCR7dGVtcGxhdGV9L2h0bWxgKSxcbiAgICAgICAgdGhpcy50ZW1wbGF0ZUV4aXN0cyhgJHt0ZW1wbGF0ZX0vdGV4dGApXG4gICAgICBdKTtcblxuICAgIGlmICghbWVzc2FnZS5zdWJqZWN0ICYmIHN1YmplY3RUZW1wbGF0ZUV4aXN0cykge1xuICAgICAgbWVzc2FnZS5zdWJqZWN0ID0gYXdhaXQgdGhpcy5yZW5kZXIoXG4gICAgICAgIGAke3RlbXBsYXRlfS9zdWJqZWN0YCxcbiAgICAgICAgT2JqZWN0LmFzc2lnbih7fSwgbG9jYWxzLCB7IHByZXR0eTogZmFsc2UgfSlcbiAgICAgICk7XG4gICAgICBtZXNzYWdlLnN1YmplY3QgPSBtZXNzYWdlLnN1YmplY3QudHJpbSgpO1xuICAgIH1cblxuICAgIGlmIChtZXNzYWdlLnN1YmplY3QgJiYgdGhpcy5jb25maWcuc3ViamVjdFByZWZpeClcbiAgICAgIG1lc3NhZ2Uuc3ViamVjdCA9IHRoaXMuY29uZmlnLnN1YmplY3RQcmVmaXggKyBtZXNzYWdlLnN1YmplY3Q7XG5cbiAgICBpZiAoIW1lc3NhZ2UuaHRtbCAmJiBodG1sVGVtcGxhdGVFeGlzdHMpXG4gICAgICBtZXNzYWdlLmh0bWwgPSBhd2FpdCB0aGlzLnJlbmRlcihgJHt0ZW1wbGF0ZX0vaHRtbGAsIGxvY2Fscyk7XG5cbiAgICBpZiAoIW1lc3NhZ2UudGV4dCAmJiB0ZXh0VGVtcGxhdGVFeGlzdHMpXG4gICAgICBtZXNzYWdlLnRleHQgPSBhd2FpdCB0aGlzLnJlbmRlcihcbiAgICAgICAgYCR7dGVtcGxhdGV9L3RleHRgLFxuICAgICAgICBPYmplY3QuYXNzaWduKHt9LCBsb2NhbHMsIHsgcHJldHR5OiBmYWxzZSB9KVxuICAgICAgKTtcblxuICAgIGlmICh0aGlzLmNvbmZpZy5odG1sVG9UZXh0ICYmIG1lc3NhZ2UuaHRtbCAmJiAhbWVzc2FnZS50ZXh0KVxuICAgICAgLy8gd2UnZCB1c2Ugbm9kZW1haWxlci1odG1sLXRvLXRleHQgcGx1Z2luXG4gICAgICAvLyBidXQgd2UgcmVhbGx5IGRvbid0IG5lZWQgdG8gc3VwcG9ydCBjaWRcbiAgICAgIC8vIDxodHRwczovL2dpdGh1Yi5jb20vYW5kcmlzOS9ub2RlbWFpbGVyLWh0bWwtdG8tdGV4dD5cbiAgICAgIG1lc3NhZ2UudGV4dCA9IGh0bWxUb1RleHQuZnJvbVN0cmluZyhcbiAgICAgICAgbWVzc2FnZS5odG1sLFxuICAgICAgICB0aGlzLmNvbmZpZy5odG1sVG9UZXh0XG4gICAgICApO1xuXG4gICAgLy8gaWYgd2Ugb25seSB3YW50IGEgdGV4dC1iYXNlZCB2ZXJzaW9uIG9mIHRoZSBlbWFpbFxuICAgIGlmICh0aGlzLmNvbmZpZy50ZXh0T25seSkgZGVsZXRlIG1lc3NhZ2UuaHRtbDtcblxuICAgIC8vIGlmIG5vIHN1YmplY3QsIGh0bWwsIG9yIHRleHQgY29udGVudCBleGlzdHMgdGhlbiB3ZSBzaG91bGRcbiAgICAvLyB0aHJvdyBhbiBlcnJvciB0aGF0IHNheXMgYXQgbGVhc3Qgb25lIG11c3QgYmUgZm91bmRcbiAgICAvLyBvdGhlcndpc2UgdGhlIGVtYWlsIHdvdWxkIGJlIGJsYW5rIChkZWZlYXRzIHB1cnBvc2Ugb2YgZW1haWwtdGVtcGxhdGVzKVxuICAgIGlmIChcbiAgICAgIHMuaXNCbGFuayhtZXNzYWdlLnN1YmplY3QpICYmXG4gICAgICBzLmlzQmxhbmsobWVzc2FnZS50ZXh0KSAmJlxuICAgICAgcy5pc0JsYW5rKG1lc3NhZ2UuaHRtbCkgJiZcbiAgICAgIF8uaXNBcnJheShtZXNzYWdlLmF0dGFjaG1lbnRzKSAmJlxuICAgICAgXy5pc0VtcHR5KG1lc3NhZ2UuYXR0YWNobWVudHMpXG4gICAgKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICBgTm8gY29udGVudCB3YXMgcGFzc2VkIGZvciBzdWJqZWN0LCBodG1sLCB0ZXh0LCBub3IgYXR0YWNobWVudHMgbWVzc2FnZSBwcm9wcy4gQ2hlY2sgdGhhdCB0aGUgZmlsZXMgZm9yIHRoZSB0ZW1wbGF0ZSBcIiR7dGVtcGxhdGV9XCIgZXhpc3QuYFxuICAgICAgKTtcblxuICAgIHJldHVybiBtZXNzYWdlO1xuICB9XG5cbiAgYXN5bmMgc2VuZChvcHRpb25zID0ge30pIHtcbiAgICBvcHRpb25zID0gT2JqZWN0LmFzc2lnbihcbiAgICAgIHtcbiAgICAgICAgdGVtcGxhdGU6ICcnLFxuICAgICAgICBtZXNzYWdlOiB7fSxcbiAgICAgICAgbG9jYWxzOiB7fVxuICAgICAgfSxcbiAgICAgIG9wdGlvbnNcbiAgICApO1xuXG4gICAgbGV0IHsgdGVtcGxhdGUsIG1lc3NhZ2UsIGxvY2FscyB9ID0gb3B0aW9ucztcblxuICAgIGNvbnN0IGF0dGFjaG1lbnRzID1cbiAgICAgIG1lc3NhZ2UuYXR0YWNobWVudHMgfHwgdGhpcy5jb25maWcubWVzc2FnZS5hdHRhY2htZW50cyB8fCBbXTtcblxuICAgIG1lc3NhZ2UgPSBfLmRlZmF1bHRzRGVlcChcbiAgICAgIHt9LFxuICAgICAgXy5vbWl0KG1lc3NhZ2UsICdhdHRhY2htZW50cycpLFxuICAgICAgXy5vbWl0KHRoaXMuY29uZmlnLm1lc3NhZ2UsICdhdHRhY2htZW50cycpXG4gICAgKTtcbiAgICBsb2NhbHMgPSBfLmRlZmF1bHRzRGVlcCh7fSwgdGhpcy5jb25maWcudmlld3MubG9jYWxzLCBsb2NhbHMpO1xuXG4gICAgaWYgKGF0dGFjaG1lbnRzKSBtZXNzYWdlLmF0dGFjaG1lbnRzID0gYXR0YWNobWVudHM7XG5cbiAgICBkZWJ1ZygndGVtcGxhdGUgJXMnLCB0ZW1wbGF0ZSk7XG4gICAgZGVidWcoJ21lc3NhZ2UgJU8nLCBtZXNzYWdlKTtcbiAgICBkZWJ1ZygnbG9jYWxzIChrZXlzIG9ubHkpOiAlTycsIE9iamVjdC5rZXlzKGxvY2FscykpO1xuXG4gICAgLy8gZ2V0IGFsbCBhdmFpbGFibGUgdGVtcGxhdGVzXG4gICAgY29uc3Qgb2JqID0gYXdhaXQgdGhpcy5yZW5kZXJBbGwodGVtcGxhdGUsIGxvY2FscywgbWVzc2FnZSk7XG5cbiAgICAvLyBhc3NpZ24gdGhlIG9iamVjdCB2YXJpYWJsZXMgb3ZlciB0byB0aGUgbWVzc2FnZVxuICAgIE9iamVjdC5hc3NpZ24obWVzc2FnZSwgb2JqKTtcblxuICAgIGlmICh0aGlzLmNvbmZpZy5wcmV2aWV3KSB7XG4gICAgICBkZWJ1ZygndXNpbmcgYHByZXZpZXctZW1haWxgIHRvIHByZXZpZXcgZW1haWwnKTtcbiAgICAgIGlmIChfLmlzT2JqZWN0KHRoaXMuY29uZmlnLnByZXZpZXcpKVxuICAgICAgICBhd2FpdCBwcmV2aWV3RW1haWwobWVzc2FnZSwgbnVsbCwgdHJ1ZSwgdGhpcy5jb25maWcucHJldmlldyk7XG4gICAgICBlbHNlIGF3YWl0IHByZXZpZXdFbWFpbChtZXNzYWdlKTtcbiAgICB9XG5cbiAgICBpZiAoIXRoaXMuY29uZmlnLnNlbmQpIHtcbiAgICAgIGRlYnVnKCdzZW5kIGRpc2FibGVkIHNvIHdlIGFyZSBlbnN1cmluZyBKU09OVHJhbnNwb3J0Jyk7XG4gICAgICAvLyA8aHR0cHM6Ly9naXRodWIuY29tL25vZGVtYWlsZXIvbm9kZW1haWxlci9pc3N1ZXMvNzk4PlxuICAgICAgLy8gaWYgKHRoaXMuY29uZmlnLnRyYW5zcG9ydC5uYW1lICE9PSAnSlNPTlRyYW5zcG9ydCcpXG4gICAgICB0aGlzLmNvbmZpZy50cmFuc3BvcnQgPSBub2RlbWFpbGVyLmNyZWF0ZVRyYW5zcG9ydCh7XG4gICAgICAgIGpzb25UcmFuc3BvcnQ6IHRydWVcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IHRoaXMuY29uZmlnLnRyYW5zcG9ydC5zZW5kTWFpbChtZXNzYWdlKTtcbiAgICBkZWJ1ZygnbWVzc2FnZSBzZW50Jyk7XG4gICAgcmVzLm9yaWdpbmFsTWVzc2FnZSA9IG1lc3NhZ2U7XG4gICAgcmV0dXJuIHJlcztcbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEVtYWlsO1xuIl19