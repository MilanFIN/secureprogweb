# web forum/similar implemented with secure programming principles in mind
* database
 - parameterized or sanitized inputs to database to prevent injections
 - limit access/modify rights to only those that are needed
* registration/login
 - prevent excessive attempts
 - securely hash&salt passwords
 - provide a token on login, to verify login later
* possibly multiple user levels
 - moderator & normal user, different rights
* access limitations
 - require a token for each query that requires authentication
 - Some solution for example cross site scripting attempts
* also ssl (https)
 - self signed certs or possibly a signed certificate