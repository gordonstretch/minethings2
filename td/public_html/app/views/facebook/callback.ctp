<font size=2>
<?
if (isset($message))
	print $message."<br>";

if (!$accountsLinked)
{
	echo '<form method="post">';
	echo $form->input('Miner.name', array('label' => 'Minethings Name'));
	echo $form->input('Miner.password', array('label' => 'Minethings Password'));
	echo $form->end('log in');

	echo "<h3>Not a registered miner?</h3>";
	echo "Sign up now at www.minethings.com!  Your first mine is free and yours to keep.  Start mining today.";
}
else
{
	echo "Your facebook and minethings accounts are now connected.";
	echo "<br>Minethings actions will automatically update your minethings profile box.";
	
	echo '<fb:if-section-not-added section="profile">';
	echo '<br>Use this link to add the minethings meld box to your profile.';
	echo '<br><div class="section_button"><fb:add-section-button section="profile"/></div>';
	echo '</fb:if-section-not-added>';

}
?>

</font>