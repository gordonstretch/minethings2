<div id="fullcenter">

<p>Invalid login user name or password.  Try again.<p>
<p>Forgot your password?  Enter your username and email and we'll send you a new one.</p>
<?
echo $form->create('Miner', array('action' => 'login'));
echo $form->input('name');
echo $form->input('email');
echo $form->end('Send');
if (isset($message)) echo $message;
?>

</div>