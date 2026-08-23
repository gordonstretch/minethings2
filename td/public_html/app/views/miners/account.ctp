<div id="fullcenter">

<h2>Account</h2>
<br>
<?
echo $form->create('Miner', array('action' => 'account') );
echo $form->input('old_password', array( 'label' => "Old Password ", 'type' => 'password') );
echo $form->input('password', array( 'label' => "New Password ", 'type' => 'password' ) );
echo $form->input('password_confirm', array( 'label' => "Confirm New Password ", 'type' => 'password' ) );
echo $form->end('Change Password');
if (isset($passwordMessage)) echo $passwordMessage;
?><BR><BR><?
echo $form->create('Miner', array('action' => 'account'));
echo $form->input('email');
echo $form->end('Change Email');
if (isset($emailMessage)) echo $emailMessage;
?>
<p>Email is optional but recommended in case of a lost password.</p>
<BR><BR>
<?
echo $form->create('Miner', array('action' => 'account'));
echo $form->input('Miner.publish_findings', array('type' => 'checkbox', 'label' => 'Publish Rare Findings'));
echo $form->input('Miner.show_mines', array('type' => 'checkbox', 'lable' => 'Show Mines in Profile'));
echo $form->end('Submit');
if (isset($privacyMessage)) echo $privacyMessage;
?>
<BR><BR>
<? echo $this->data['Miner']['actions']; ?>/4000 actions used today.  Chatting, detonating explosives, and activating gadgets do not count.
</div>
