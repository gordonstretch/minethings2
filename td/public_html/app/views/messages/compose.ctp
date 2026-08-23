<h1>Message to <? echo $recipientName; ?></h1>
<?php
	echo $form->create('Message', array('action' => 'compose/'.$recipientId));

	echo $form->input( 'body' );

	echo $form->end('Send');
?>
