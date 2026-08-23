<? 
echo $ajax->div('ChatsDiv');
if (strlen($message))
	echo '<p>'.$message.'</p>';
echo $text;
echo $ajax->divEnd('ChatsDiv'); 
?>